import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { ChargerGateway } from '../charger-gateway/charger-gateway.port.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import type { ChargingSession } from './domain/charging-session.entity.js';
import {
  SessionEvents,
  type SessionSnapshot,
  snapshotOf,
} from './session-events.js';

@Injectable()
export class SessionStarter {
  private readonly logger = new Logger(SessionStarter.name);

  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly gateway: ChargerGateway,
    private readonly clock: Clock,
    private readonly events: SessionEvents,
  ) {}

  async start(session: ChargingSession): Promise<boolean> {
    const props = session.toProps();
    const before = snapshotOf(session);
    try {
      const started = await this.gateway.start({
        sessionId: props.id,
        chargerSerialNumber: props.chargerSerialNumber,
        allocatedPowerKw: props.allocatedPowerKw,
      });
      session.activate(
        started.transactionId,
        started.vehicle,
        this.clock.now(),
      );
    } catch (error) {
      this.logger.warn(
        `Charger ${props.chargerSerialNumber} did not start: ${String(error)}`,
      );
      session.interrupt(this.clock.now());
      await this.saveAndPublish(before, session);
      return false;
    }
    await this.saveAndPublish(before, session);
    return true;
  }

  private async saveAndPublish(
    before: SessionSnapshot,
    session: ChargingSession,
  ): Promise<void> {
    if (await this.sessions.save(session, [])) {
      await this.events.changed(before, session);
    }
  }
}
