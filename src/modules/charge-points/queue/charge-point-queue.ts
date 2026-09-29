import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Clock } from '../../../common/clock/clock.js';
import { toSaoPauloTime } from '../../../common/time/sao-paulo-time.js';
import { Notifier } from '../../notifications/notifier.js';
import {
  ChargePointStatus,
  chargePointStatus,
} from '../charge-point-status.js';
import { ChargePointsRepository } from '../charge-points.repository.js';
import { QueueEntryResponseDto } from './dto/queue-entry.response.dto.js';
import {
  queueConflict,
  queueEntryNotFound,
  QueueErrorCode,
} from './queue-errors.js';
import {
  applyPlan,
  isActiveEntry,
  planAdvance,
  QUEUE_RESERVATION_MINUTES,
  type QueueEntryRecord,
  reservationEnd,
  summarize,
} from './queue-rules.js';
import { JoinQueueResult, QueueRepository } from './queue.repository.js';

function formatTime(date: Date): string {
  const local = toSaoPauloTime(date);
  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}

@Injectable()
export class ChargePointQueue {
  private readonly logger = new Logger(ChargePointQueue.name);

  constructor(
    private readonly queue: QueueRepository,
    private readonly points: ChargePointsRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async refresh(
    statuses: Map<string, ChargePointStatus>,
    now: Date,
  ): Promise<Map<string, QueueEntryRecord[]>> {
    const active = await this.queue.findActive([...statuses.keys()]);
    const byPoint = new Map<string, QueueEntryRecord[]>();
    for (const entry of active) {
      byPoint.set(entry.chargePointId, [
        ...(byPoint.get(entry.chargePointId) ?? []),
        entry,
      ]);
    }
    for (const [chargePointId, entries] of byPoint) {
      const plan = planAdvance(
        entries,
        statuses.get(chargePointId) === ChargePointStatus.AVAILABLE,
        now,
      );
      await this.queue.expire(plan.expiredIds, now);
      const promoted = plan.promoteId
        ? await this.queue.promote(plan.promoteId, reservationEnd(now), now)
        : null;
      if (promoted) {
        await this.notifyTurn(promoted);
      }
      byPoint.set(chargePointId, applyPlan(entries, plan, promoted));
    }
    return byPoint;
  }

  async advance(chargePointId: string, now: Date): Promise<void> {
    try {
      await this.refresh(await this.statusesOf(chargePointId), now);
    } catch (error) {
      this.logger.warn(
        `Could not advance the queue of ${chargePointId}: ${String(error)}`,
      );
    }
  }

  async join(
    userId: string,
    chargePointId: string,
  ): Promise<QueueEntryResponseDto> {
    const now = this.clock.now();
    await this.ensureVisible(userId, chargePointId);
    const statuses = await this.statusesOf(chargePointId);
    const status = statuses.get(chargePointId);
    const entries =
      (await this.refresh(statuses, now)).get(chargePointId) ?? [];
    if (status === ChargePointStatus.OFFLINE) {
      throw queueConflict(
        QueueErrorCode.CHARGE_POINT_OFFLINE,
        'Charge point is offline',
      );
    }
    const reserved = entries.some((entry) => entry.status === 'NOTIFIED');
    if (status === ChargePointStatus.AVAILABLE && !reserved) {
      throw queueConflict(
        QueueErrorCode.CHARGE_POINT_AVAILABLE,
        'Charge point is available, start a session instead',
      );
    }
    if (await this.points.hasOpenSession(userId, chargePointId)) {
      throw queueConflict(
        QueueErrorCode.QUEUE_OWN_SESSION,
        'You are already using this charge point',
      );
    }
    const { result, entry } = await this.queue.join(userId, chargePointId, now);
    if (result === JoinQueueResult.ALREADY_IN_QUEUE) {
      throw queueConflict(
        QueueErrorCode.ALREADY_IN_QUEUE,
        'You are already in the queue of this charge point',
      );
    }
    if (result === JoinQueueResult.ACTIVE_QUEUE_EXISTS || !entry) {
      throw queueConflict(
        QueueErrorCode.ACTIVE_QUEUE_EXISTS,
        'You are already in the queue of another charge point',
      );
    }
    return this.toResponse(entry, [...entries, entry]);
  }

  async leave(userId: string, chargePointId: string): Promise<void> {
    const active = await this.queue.findActiveByUser(userId);
    if (!active || active.chargePointId !== chargePointId) {
      throw queueEntryNotFound();
    }
    const now = this.clock.now();
    await this.queue.close(active.id, 'LEFT', now);
    await this.advance(chargePointId, now);
  }

  async mine(
    userId: string,
    chargePointId: string,
  ): Promise<QueueEntryResponseDto> {
    await this.ensureVisible(userId, chargePointId);
    const entries =
      (
        await this.refresh(
          await this.statusesOf(chargePointId),
          this.clock.now(),
        )
      ).get(chargePointId) ?? [];
    const entry =
      entries.find((item) => item.userId === userId) ??
      (await this.queue.findLatest(userId, chargePointId));
    if (!entry) {
      throw queueEntryNotFound();
    }
    return this.toResponse(entry, entries);
  }

  async sessionStarted(
    userId: string,
    chargePointId: string,
    now: Date,
  ): Promise<void> {
    try {
      const active = await this.queue.findActiveByUser(userId);
      if (!active) {
        return;
      }
      if (active.chargePointId === chargePointId) {
        await this.queue.close(active.id, 'FULFILLED', now);
        return;
      }
      await this.queue.close(active.id, 'LEFT', now);
      await this.advance(active.chargePointId, now);
    } catch (error) {
      this.logger.warn(
        `Could not update the queue entry of user ${userId}: ${String(error)}`,
      );
    }
  }

  toResponse(
    entry: QueueEntryRecord,
    activeEntries: QueueEntryRecord[],
  ): QueueEntryResponseDto {
    const summary = summarize(activeEntries, entry.userId);
    return QueueEntryResponseDto.fromRecord(
      entry,
      isActiveEntry(entry) ? summary.myPosition : null,
      summary.queueLength,
    );
  }

  private async statusesOf(
    chargePointId: string,
  ): Promise<Map<string, ChargePointStatus>> {
    const point = await this.points.findOnlineState(chargePointId);
    if (!point) {
      return new Map();
    }
    const occupying = await this.points.findOccupyingSessions([chargePointId]);
    return new Map([
      [
        chargePointId,
        chargePointStatus(point.isOnline, occupying.get(chargePointId) ?? null),
      ],
    ]);
  }

  private async ensureVisible(
    userId: string,
    chargePointId: string,
  ): Promise<void> {
    const points = await this.points.findVisibleTo(userId, {
      id: chargePointId,
    });
    if (points.length === 0) {
      throw new NotFoundException('Charge point not found');
    }
  }

  private async notifyTurn(entry: QueueEntryRecord): Promise<void> {
    try {
      const name = await this.queue.pointName(entry.chargePointId);
      const reservedUntil =
        entry.reservedUntil ?? reservationEnd(this.clock.now());
      await this.notifier.notify({
        userId: entry.userId,
        type: 'QUEUE_TURN',
        title: `Sua vez no ponto ${name}`,
        body: `O ponto ${name} está livre e reservado para você por ${QUEUE_RESERVATION_MINUTES} minutos, até ${formatTime(reservedUntil)}. Inicie a recarga antes disso para não perder a vez.`,
        data: {
          queueEntryId: entry.id,
          chargePointId: entry.chargePointId,
          chargePointName: name,
          reservedUntil: reservedUntil.toISOString(),
        },
        dedupeKey: `queue:${entry.id}:QUEUE_TURN`,
      });
    } catch (error) {
      this.logger.warn(
        `Could not notify queue entry ${entry.id}: ${String(error)}`,
      );
    }
  }
}
