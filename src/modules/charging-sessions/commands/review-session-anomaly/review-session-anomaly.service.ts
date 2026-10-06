import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import {
  SessionErrorCode,
  sessionConflict,
  sessionNotFound,
} from '../../charging-session.errors.js';
import { toOrganizationDetailResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import type { AnomalyReviewDecision } from '../../domain/anomaly-review.js';
import {
  AnomalyNotFlaggedError,
  type ChargingSession,
} from '../../domain/charging-session.entity.js';
import type { OrganizationSessionDetailResponseDto } from '../../dto/organization-session-detail.response.dto.js';
import { SessionProjector } from '../../session-projector.js';

const MAX_SAVE_ATTEMPTS = 3;

export interface ReviewSessionAnomalyCommand {
  organizationId: string;
  sessionId: string;
  reviewerId: string;
  decision: AnomalyReviewDecision;
  note: string | null;
}

@Injectable()
export class ReviewSessionAnomalyService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly clock: Clock,
    private readonly projector: SessionProjector,
  ) {}

  async execute(
    command: ReviewSessionAnomalyCommand,
  ): Promise<OrganizationSessionDetailResponseDto> {
    const session = await this.review(command);
    const driver = await this.sessions.findDriver(session.userId);
    if (!driver) {
      throw sessionNotFound();
    }
    return toOrganizationDetailResponse(
      session,
      await this.sessions.findReadings(session.id),
      this.projector.timelineOf(session),
      driver,
    );
  }

  private async review(
    command: ReviewSessionAnomalyCommand,
  ): Promise<ChargingSession> {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const session = await this.sessions.findById(command.sessionId);
      if (!session || session.organizationId !== command.organizationId) {
        throw sessionNotFound();
      }
      try {
        session.reviewAnomaly({
          decision: command.decision,
          note: command.note,
          reviewerId: command.reviewerId,
          at: this.clock.now(),
        });
      } catch (error) {
        if (error instanceof AnomalyNotFlaggedError) {
          throw sessionConflict(
            SessionErrorCode.SESSION_NOT_FLAGGED,
            'Only sessions flagged as anomalous can be reviewed',
          );
        }
        throw error;
      }
      if (await this.sessions.save(session, [])) {
        return session;
      }
    }
    throw new Error(
      `Session ${command.sessionId} kept changing while reviewing its anomaly`,
    );
  }
}
