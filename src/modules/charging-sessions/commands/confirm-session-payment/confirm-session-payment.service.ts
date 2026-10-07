import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import {
  paymentProviderError,
  SessionErrorCode,
  sessionConflict,
  sessionNotFound,
} from '../../charging-session.errors.js';
import { toResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import type { ChargingSession } from '../../domain/charging-session.entity.js';
import type { SessionResponseDto } from '../../dto/session.response.dto.js';
import { SessionPayments } from '../../session-payments.js';
import { SessionSynchronizer } from '../../session-synchronizer.js';
import { SessionProjector } from '../../session-projector.js';

@Injectable()
export class ConfirmSessionPaymentService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly payments: SessionPayments,
    private readonly synchronizer: SessionSynchronizer,
    private readonly clock: Clock,
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
    if (!found.payment) {
      throw sessionConflict(
        SessionErrorCode.PAYMENT_NOT_REQUIRED,
        'This session is not paid by card',
      );
    }
    const now = this.clock.now();
    let reconciled: ChargingSession;
    try {
      reconciled = await this.payments.reconcile(found, now);
    } catch (error) {
      throw paymentProviderError(error);
    }
    const session = await this.synchronizer.sync(reconciled, now);
    return toResponse(session, this.projector.timelineOf(session));
  }
}
