import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import {
  type ChargePointQuote,
  ChargePointsService,
} from '../../../charge-points/charge-points.service.js';
import { ChargePointQueue } from '../../../charge-points/queue/charge-point-queue.js';
import { allocatePowerKw } from '../../../charge-points/site-capacity.js';
import { ChargerGateway } from '../../../charger-gateway/charger-gateway.port.js';
import { toResponse } from '../../charging-session.mapper.js';
import {
  paymentProviderError,
  paymentsUnavailable,
  SessionErrorCode,
  sessionConflict,
  sessionError,
} from '../../charging-session.errors.js';
import {
  ChargingSessionRepository,
  CreateSessionResult,
} from '../../database/charging-session.repository.port.js';
import type { ChargingLimit } from '../../domain/charging-limit.js';
import { ChargingSession } from '../../domain/charging-session.entity.js';
import type { PaymentSheetDto } from '../../dto/payment-sheet.dto.js';
import { SessionEvents, snapshotOf } from '../../session-events.js';
import { SessionPayments } from '../../session-payments.js';
import { SessionStarter } from '../../session-starter.js';
import type {
  ChargingLimitRequestDto,
  StartSessionRequestDto,
} from './start-session.request.dto.js';
import { StartSessionResponseDto } from './start-session.response.dto.js';

const WH_PER_KWH = 1000;

@Injectable()
export class StartSessionService {
  private readonly logger = new Logger(StartSessionService.name);

  constructor(
    private readonly chargePoints: ChargePointsService,
    private readonly sessions: ChargingSessionRepository,
    private readonly gateway: ChargerGateway,
    private readonly starter: SessionStarter,
    private readonly payments: SessionPayments,
    private readonly clock: Clock,
    private readonly events: SessionEvents,
    private readonly queue: ChargePointQueue,
  ) {}

  async execute(
    userId: string,
    dto: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    const now = this.clock.now();
    const limit = toLimit(dto.limit);
    const quote = await this.chargePoints.quote(userId, dto.chargePointId, now);
    const { tariff, pricePerKwhCents, chargerSerialNumber } = quote;
    if (quote.status === 'OFFLINE' || !chargerSerialNumber) {
      throw sessionConflict(
        SessionErrorCode.CHARGE_POINT_OFFLINE,
        'Charge point is offline',
      );
    }
    if (!tariff || pricePerKwhCents === null) {
      throw sessionConflict(
        SessionErrorCode.TARIFF_NOT_CONFIGURED,
        'Charge point has no tariff',
      );
    }
    if (quote.reservedForUserId && quote.reservedForUserId !== userId) {
      throw sessionConflict(
        SessionErrorCode.CHARGE_POINT_RESERVED,
        'Charge point is reserved for the next driver in the queue',
      );
    }
    if (quote.type === 'COMMERCIAL' && !this.payments.enabled) {
      throw paymentsUnavailable();
    }
    const allocatedPowerKw = await this.allocatePower(quote);

    const session = ChargingSession.create({
      id: randomUUID(),
      userId,
      chargePointId: quote.chargePointId,
      chargePointCode: quote.code,
      chargePointName: quote.name,
      chargerSerialNumber,
      organizationId: quote.organizationId,
      unitLabel: quote.membership?.unitLabel ?? null,
      regime: quote.type,
      limit,
      allocatedPowerKw,
      timeScale: this.gateway.timeScale,
      lockedRateCents: pricePerKwhCents,
      demandFactor: quote.demand.factor,
      demandFactorSource: quote.demand.source,
      demandModelVersion: quote.demand.modelVersion,
      idleFeeCentsPerMinute: tariff.idleFeeCentsPerMinute,
      idleFeeCapCents: tariff.idleFeeCapCents,
      gracePeriodMinutes: tariff.gracePeriodMinutes,
      startedAt: now,
    });

    const created = await this.sessions.createExclusive(session);
    if (created === CreateSessionResult.ACTIVE_SESSION_EXISTS) {
      throw sessionConflict(
        SessionErrorCode.ACTIVE_SESSION_EXISTS,
        'You already have an active session',
      );
    }
    if (created === CreateSessionResult.CHARGE_POINT_BUSY) {
      throw sessionConflict(
        SessionErrorCode.CHARGE_POINT_BUSY,
        'Charge point is in use',
      );
    }
    await this.queue.sessionStarted(userId, quote.chargePointId, now);

    if (session.requiresPayment) {
      return toStartResponse(session, await this.openPayment(session));
    }
    if (!(await this.starter.start(session))) {
      throw sessionError(
        HttpStatus.SERVICE_UNAVAILABLE,
        SessionErrorCode.CHARGER_UNAVAILABLE,
        'Charger did not start the session',
      );
    }
    return toStartResponse(session, null);
  }

  private async openPayment(
    session: ChargingSession,
  ): Promise<PaymentSheetDto> {
    try {
      return await this.payments.open(session);
    } catch (error) {
      this.logger.warn(
        `Payment for session ${session.id} could not be opened: ${String(error)}`,
      );
      const before = snapshotOf(session);
      session.interrupt(this.clock.now());
      if (await this.sessions.save(session, [])) {
        await this.events.changed(before, session);
      }
      await this.payments.settle(session);
      throw paymentProviderError(error);
    }
  }

  private async allocatePower(quote: ChargePointQuote): Promise<number> {
    const allocated = allocatePowerKw({
      maxPowerKw: quote.maxPowerKw,
      capacity: quote.capacity,
      activeSessionsKw: await this.sessions.chargingPowerKw(
        quote.organizationId,
      ),
    });
    if (allocated === null) {
      throw sessionConflict(
        SessionErrorCode.BUILDING_CAPACITY_EXCEEDED,
        'Building capacity is fully used, try again later',
      );
    }
    return allocated;
  }
}

function toLimit(dto: ChargingLimitRequestDto | undefined): ChargingLimit {
  switch (dto?.type) {
    case undefined:
    case 'FULL':
      return { type: 'FULL' };
    case 'ENERGY':
      return {
        type: 'ENERGY',
        energyWh: Math.round((dto.value ?? 0) * WH_PER_KWH),
      };
    case 'AMOUNT':
      if (!Number.isInteger(dto.value)) {
        throw sessionError(
          HttpStatus.BAD_REQUEST,
          SessionErrorCode.INVALID_LIMIT,
          'AMOUNT limits take an integer value in cents',
        );
      }
      return { type: 'AMOUNT', amountCents: dto.value ?? 0 };
  }
}

function toStartResponse(
  session: ChargingSession,
  paymentSheet: PaymentSheetDto | null,
): StartSessionResponseDto {
  return Object.assign(new StartSessionResponseDto(), toResponse(session), {
    paymentSheet,
  });
}
