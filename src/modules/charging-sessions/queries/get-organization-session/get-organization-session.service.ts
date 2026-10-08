import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { sessionNotFound } from '../../charging-session.errors.js';
import { toOrganizationDetailResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import type { OrganizationSessionDetailResponseDto } from '../../dto/organization-session-detail.response.dto.js';
import { SessionProjector } from '../../session-projector.js';
import { SessionSynchronizer } from '../../session-synchronizer.js';

@Injectable()
export class GetOrganizationSessionService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly synchronizer: SessionSynchronizer,
    private readonly clock: Clock,
    private readonly projector: SessionProjector,
  ) {}

  async execute(
    organizationId: string,
    sessionId: string,
  ): Promise<OrganizationSessionDetailResponseDto> {
    const found = await this.sessions.findById(sessionId);
    if (!found || found.organizationId !== organizationId) {
      throw sessionNotFound();
    }
    const driver = await this.sessions.findDriver(found.userId);
    if (!driver) {
      throw sessionNotFound();
    }
    const session = await this.synchronizer.sync(found, this.clock.now());
    const readings = await this.sessions.findReadings(session.id);
    return toOrganizationDetailResponse(
      session,
      readings,
      this.projector.timelineOf(session),
      driver,
    );
  }
}
