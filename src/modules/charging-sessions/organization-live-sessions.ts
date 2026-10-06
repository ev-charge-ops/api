import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import type { ChargingSession } from './domain/charging-session.entity.js';
import { SessionStatus } from './domain/session-status.js';
import { SessionSynchronizer } from './session-synchronizer.js';

export interface LiveSession {
  sessionId: string;
  chargePointId: string;
  status: SessionStatus;
  powerKw: number;
  graceEndsAt: Date | null;
}

@Injectable()
export class OrganizationLiveSessions {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly synchronizer: SessionSynchronizer,
    private readonly clock: Clock,
  ) {}

  async refresh(organizationId: string): Promise<LiveSession[]> {
    const now = this.clock.now();
    const open = await this.sessions.findOpenByOrganization(organizationId);
    const live: LiveSession[] = [];
    for (const found of open) {
      const session = await this.synchronizer.sync(found, now);
      if (session.isOpen) {
        live.push(toLiveSession(session));
      }
    }
    return live;
  }
}

function toLiveSession(session: ChargingSession): LiveSession {
  const props = session.toProps();
  return {
    sessionId: props.id,
    chargePointId: props.chargePointId,
    status: props.status,
    powerKw: props.status === SessionStatus.ACTIVE ? props.powerKw : 0,
    graceEndsAt: session.graceEndsAt,
  };
}
