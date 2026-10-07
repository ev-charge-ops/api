import { Injectable } from '@nestjs/common';
import { ChargerGateway } from '../charger-gateway/charger-gateway.port.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import type {
  ChargingSession,
  MeterSample,
} from './domain/charging-session.entity.js';
import { SessionStatus } from './domain/session-status.js';
import { SessionEvents, snapshotOf } from './session-events.js';
import { SessionPayments } from './session-payments.js';
import { chargingProfileOf } from './session-projector.js';

@Injectable()
export class SessionSynchronizer {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly gateway: ChargerGateway,
    private readonly payments: SessionPayments,
    private readonly events: SessionEvents,
  ) {}

  async sync(session: ChargingSession, now: Date): Promise<ChargingSession> {
    if (!session.isOpen) {
      await this.payments.settle(session);
      return session;
    }
    const before = snapshotOf(session);
    if (
      session.isPaymentOverdue(now, this.payments.authorizationTimeoutMinutes)
    ) {
      session.interrupt(now);
      if (!(await this.sessions.save(session, []))) {
        return (await this.sessions.findById(session.id)) ?? session;
      }
      await this.events.changed(before, session);
      await this.payments.settle(session);
      return session;
    }
    const readings = await this.readTelemetry(session, now);
    session.advance(now);
    if (await this.sessions.save(session, readings)) {
      await this.events.changed(before, session);
      return session;
    }
    return (await this.sessions.findById(session.id)) ?? session;
  }

  private async readTelemetry(
    session: ChargingSession,
    now: Date,
  ): Promise<MeterSample[]> {
    if (session.status !== SessionStatus.ACTIVE) {
      return [];
    }
    const props = session.toProps();
    const telemetry = await this.gateway.readTelemetry(
      chargingProfileOf(session),
      { since: props.telemetryReadAt ?? props.startedAt, until: now },
    );
    session.recordTelemetry(telemetry.current, telemetry.completedAt, now);
    return telemetry.samples;
  }
}
