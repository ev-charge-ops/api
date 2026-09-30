import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { ChargerGateway } from '../../../charger-gateway/charger-gateway.port.js';
import { AnomalyScorer } from '../../../intelligence/anomaly/anomaly-scorer.port.js';
import {
  SessionErrorCode,
  sessionConflict,
  sessionNotFound,
} from '../../charging-session.errors.js';
import { toResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import {
  type ChargingSession,
  type MeterSample,
  SessionAlreadyEndedError,
} from '../../domain/charging-session.entity.js';
import { SessionStatus } from '../../domain/session-status.js';
import type { SessionResponseDto } from '../../dto/session.response.dto.js';
import { SessionEvents, snapshotOf } from '../../session-events.js';
import { SessionPayments } from '../../session-payments.js';
import { SessionSynchronizer } from '../../session-synchronizer.js';
import { sessionFeatures } from './session-features.js';
import { SessionProjector } from '../../session-projector.js';

@Injectable()
export class StopSessionService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly synchronizer: SessionSynchronizer,
    private readonly gateway: ChargerGateway,
    private readonly anomalyScorer: AnomalyScorer,
    private readonly payments: SessionPayments,
    private readonly clock: Clock,
    private readonly events: SessionEvents,
    private readonly projector: SessionProjector,
  ) {}

  async execute(
    userId: string,
    sessionId: string,
  ): Promise<SessionResponseDto> {
    const found = await this.sessions.findById(sessionId);
    if (!found || found.userId !== userId) {
      throw sessionNotFound();
    }
    if (!found.isOpen) {
      throw alreadyEnded();
    }
    const now = this.clock.now();
    const session = await this.synchronizer.sync(found, now);
    const readings: MeterSample[] = [];
    if (session.status === SessionStatus.ACTIVE) {
      await this.stopCharger(session);
      const props = session.toProps();
      readings.push({
        at: now,
        energyWh: props.energyWh,
        powerKw: 0,
        socPercent: props.socPercent,
      });
    }
    const before = snapshotOf(session);
    try {
      session.stop(now);
    } catch (error) {
      if (error instanceof SessionAlreadyEndedError) {
        throw alreadyEnded();
      }
      throw error;
    }
    if (!(await this.sessions.save(session, readings))) {
      throw alreadyEnded();
    }
    await this.events.changed(before, session);
    await this.scoreAnomaly(session);
    await this.payments.settle(session);
    return toResponse(session, this.projector.timelineOf(session));
  }

  private async scoreAnomaly(session: ChargingSession): Promise<void> {
    const result = await this.anomalyScorer.score(
      sessionFeatures(session.toProps()),
    );
    if (!result) {
      return;
    }
    session.recordAnomaly(result);
    await this.sessions.save(session, []);
  }

  private async stopCharger(session: ChargingSession): Promise<void> {
    const props = session.toProps();
    if (!props.externalTransactionId) {
      return;
    }
    await this.gateway.stop({
      chargerSerialNumber: props.chargerSerialNumber,
      transactionId: props.externalTransactionId,
    });
  }
}

function alreadyEnded() {
  return sessionConflict(
    SessionErrorCode.SESSION_ALREADY_ENDED,
    'Session has already ended',
  );
}
