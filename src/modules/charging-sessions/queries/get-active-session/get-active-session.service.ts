import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { toResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import { SessionSynchronizer } from '../../session-synchronizer.js';
import { ActiveSessionResponseDto } from './active-session.response.dto.js';
import { SessionProjector } from '../../session-projector.js';

@Injectable()
export class GetActiveSessionService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly synchronizer: SessionSynchronizer,
    private readonly clock: Clock,
    private readonly projector: SessionProjector,
  ) {}

  async execute(userId: string): Promise<ActiveSessionResponseDto> {
    const found = await this.sessions.findOpenByUser(userId);
    const session = found
      ? await this.synchronizer.sync(found, this.clock.now())
      : null;
    return Object.assign(new ActiveSessionResponseDto(), {
      session: session
        ? toResponse(session, this.projector.timelineOf(session))
        : null,
    });
  }
}
