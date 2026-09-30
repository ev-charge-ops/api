import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { formatBrl } from '../../common/format/brl.js';
import type { NotificationType } from '../../generated/prisma/enums.js';
import { ChargePointQueue } from '../charge-points/queue/charge-point-queue.js';
import { formatDuration } from '../mail/templates/format-duration.js';
import type {
  NewNotification,
  NotificationData,
} from '../notifications/database/notifications.repository.port.js';
import { Notifier } from '../notifications/notifier.js';
import type { ChargingSession } from './domain/charging-session.entity.js';
import { PaymentStatus } from './domain/session-payment.js';
import { isOpenStatus, SessionStatus } from './domain/session-status.js';
import { SessionProjector } from './session-projector.js';

export const LATE_TRANSITION_MS = 60_000;

interface SessionMessage {
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function messagesFor(session: ChargingSession): SessionMessage[] {
  const props = session.toProps();
  const point = props.chargePointName;
  const messages: SessionMessage[] = [];
  const status = props.status;
  if (status === SessionStatus.ACTIVE) {
    messages.push({
      type: 'SESSION_ACTIVE',
      title: 'Carregador liberado',
      body: `Sua recarga no ponto ${point} começou.`,
    });
  }
  if (status === SessionStatus.GRACE || status === SessionStatus.IDLE) {
    messages.push({
      type: 'CHARGING_COMPLETE',
      title: 'Recarga concluída',
      body: `Seu veículo no ponto ${point} terminou de carregar. Você tem ${formatDuration(props.gracePeriodMinutes)} de tolerância para liberar a vaga antes da multa por ociosidade.`,
      data: {
        graceEndsAt: iso(session.graceEndsAt),
        gracePeriodMinutes: props.gracePeriodMinutes,
      },
    });
  }
  if (status === SessionStatus.IDLE) {
    messages.push({
      type: 'IDLE_FEE_STARTED',
      title: 'Multa por ociosidade iniciada',
      body: `A tolerância no ponto ${point} acabou. A multa é de ${formatBrl(props.idleFeeCentsPerMinute)} por minuto, até ${formatBrl(props.idleFeeCapCents)}. Libere a vaga para encerrar a sessão.`,
      data: {
        idleStartsAt: iso(session.idleStartsAt),
        idleFeeCapReachedAt: iso(session.idleFeeCapReachedAt),
        idleFeeCentsPerMinute: props.idleFeeCentsPerMinute,
        idleFeeCapCents: props.idleFeeCapCents,
      },
    });
  }
  if (status === SessionStatus.INTERRUPTED) {
    messages.push({
      type: 'SESSION_INTERRUPTED',
      title: 'Recarga interrompida',
      body:
        props.totalCents > 0
          ? `A recarga no ponto ${point} foi interrompida.`
          : `A recarga no ponto ${point} foi interrompida antes de começar. Nenhum valor será cobrado.`,
      data: { totalCents: props.totalCents },
    });
  }
  const payment = props.payment;
  if (payment?.status === PaymentStatus.CAPTURED) {
    const amountCents = payment.capturedCents ?? 0;
    messages.push({
      type: 'PAYMENT_CAPTURED',
      title: 'Pagamento confirmado',
      body: `Cobramos ${formatBrl(amountCents)} no cartão pela recarga no ponto ${point}.`,
      data: { amountCents, currency: payment.currency },
    });
  }
  if (payment?.status === PaymentStatus.FAILED) {
    messages.push({
      type: 'PAYMENT_FAILED',
      title: 'Pagamento recusado',
      body: `Não conseguimos autorizar o cartão para a recarga no ponto ${point}. Tente novamente com outro cartão.`,
      data: { failureCode: payment.failureCode },
    });
  }
  return messages;
}

export function sessionNotifications(
  session: ChargingSession,
): NewNotification[] {
  const props = session.toProps();
  return messagesFor(session).map((message) => ({
    userId: props.userId,
    type: message.type,
    title: message.title,
    body: message.body,
    data: {
      sessionId: props.id,
      chargePointId: props.chargePointId,
      chargePointName: props.chargePointName,
      ...message.data,
    },
    dedupeKey: `session:${props.id}:${message.type}`,
  }));
}

export interface SessionSnapshot {
  status: SessionStatus;
  paymentStatus: PaymentStatus | null;
}

export function snapshotOf(session: ChargingSession): SessionSnapshot {
  return {
    status: session.status,
    paymentStatus: session.payment?.status ?? null,
  };
}

@Injectable()
export class SessionEvents {
  constructor(
    private readonly notifier: Notifier,
    private readonly queue: ChargePointQueue,
    private readonly clock: Clock,
    private readonly projector: SessionProjector,
  ) {}

  async changed(
    before: SessionSnapshot | null,
    session: ChargingSession,
  ): Promise<void> {
    const after = snapshotOf(session);
    if (
      before?.status === after.status &&
      before.paymentStatus === after.paymentStatus
    ) {
      return;
    }
    const silent = this.detectedLate(session);
    for (const notification of sessionNotifications(session)) {
      await this.notifier.notify(notification, {
        push: !silent.has(notification.type),
      });
    }
    if ((!before || isOpenStatus(before.status)) && !session.isOpen) {
      await this.queue.advance(
        session.toProps().chargePointId,
        this.clock.now(),
      );
    }
  }

  private detectedLate(session: ChargingSession): Set<NotificationType> {
    const silent = new Set<NotificationType>();
    if (!this.projector.isProjectable(session)) {
      return silent;
    }
    const now = this.clock.now().getTime();
    const isLate = (at: Date | null) =>
      at !== null && now - at.getTime() > LATE_TRANSITION_MS;
    if (isLate(session.toProps().chargingEndedAt)) {
      silent.add('CHARGING_COMPLETE');
    }
    if (isLate(session.idleStartsAt)) {
      silent.add('IDLE_FEE_STARTED');
    }
    return silent;
  }
}
