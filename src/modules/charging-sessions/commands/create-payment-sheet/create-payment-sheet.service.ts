import { Injectable } from '@nestjs/common';
import {
  paymentProviderError,
  SessionErrorCode,
  sessionConflict,
  sessionNotFound,
} from '../../charging-session.errors.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import { SessionStatus } from '../../domain/session-status.js';
import type { PaymentSheetDto } from '../../dto/payment-sheet.dto.js';
import { SessionPayments } from '../../session-payments.js';

@Injectable()
export class CreatePaymentSheetService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly payments: SessionPayments,
  ) {}

  async execute(userId: string, sessionId: string): Promise<PaymentSheetDto> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw sessionNotFound();
    }
    if (!session.payment) {
      throw sessionConflict(
        SessionErrorCode.PAYMENT_NOT_REQUIRED,
        'This session is not paid by card',
      );
    }
    if (session.status !== SessionStatus.AWAITING_PAYMENT) {
      throw sessionConflict(
        SessionErrorCode.PAYMENT_NOT_PENDING,
        'The payment of this session is no longer pending',
      );
    }
    try {
      return await this.payments.sheetFor(session);
    } catch (error) {
      throw paymentProviderError(error);
    }
  }
}
