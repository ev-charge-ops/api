import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { sessionNotFound } from '../../charging-session.errors.js';
import { toDetailResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import type { SessionDetailResponseDto } from '../../dto/session-detail.response.dto.js';
import { SessionSynchronizer } from '../../session-synchronizer.js';
import { SessionProjector } from '../../session-projector.js';

@Injectable()
export class GetSessionService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly synchronizer: SessionSynchronizer,
    private readonly clock: Clock,
    private readonly projector: SessionProjector,
  ) {}

  async execute(
    userId: string,
    sessionId: string,
  ): Promise<SessionDetailResponseDto> {
    const found = await this.sessions.findById(sessionId);
    if (!found || found.userId !== userId) {
      throw sessionNotFound();
    }
    const session = await this.synchronizer.sync(found, this.clock.now());
    const readings = await this.sessions.findReadings(session.id);
    return toDetailResponse(
      session,
      readings,
      this.projector.timelineOf(session),
    );
  }
}
