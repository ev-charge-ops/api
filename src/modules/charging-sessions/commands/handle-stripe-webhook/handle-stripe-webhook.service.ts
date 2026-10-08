import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import {
  InvalidPaymentWebhookError,
  type PaymentGateway,
  type PaymentWebhookEvent,
} from '../../../payments/payment-gateway.port.js';
import { PaymentGateways } from '../../../payments/payment-gateways.js';
import {
  paymentsUnavailable,
  SessionErrorCode,
  sessionError,
} from '../../charging-session.errors.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import { PaymentRecordsRepository } from '../../database/payment-records.repository.js';
import type { PaymentMode } from '../../domain/session-payment.js';
import { SessionPayments } from '../../session-payments.js';
import { WebhookReceiptDto } from './webhook-receipt.dto.js';

export const HANDLED_PAYMENT_EVENTS = [
  'payment_intent.amount_capturable_updated',
  'payment_intent.canceled',
  'payment_intent.payment_failed',
  'payment_intent.succeeded',
];

@Injectable()
export class HandleStripeWebhookService {
  private readonly logger = new Logger(HandleStripeWebhookService.name);

  constructor(
    private readonly gateways: PaymentGateways,
    private readonly sessions: ChargingSessionRepository,
    private readonly records: PaymentRecordsRepository,
    private readonly payments: SessionPayments,
    private readonly clock: Clock,
  ) {}

  async execute(
    mode: PaymentMode,
    payload: Buffer | undefined,
    signature: string | undefined,
  ): Promise<WebhookReceiptDto> {
    const gateway = this.gateways.for(mode);
    if (!gateway.webhooksEnabled) {
      throw paymentsUnavailable();
    }
    const event = this.verify(gateway, payload, signature);
    if (
      !HANDLED_PAYMENT_EVENTS.includes(event.type) ||
      !event.paymentIntentId
    ) {
      return receipt(false);
    }
    if (await this.records.isEventProcessed(event.id)) {
      return receipt(false);
    }
    const session = await this.sessions.findByPaymentIntentId(
      event.paymentIntentId,
    );
    if (session && session.payment?.mode === mode) {
      const reconciled = await this.payments.reconcile(
        session,
        this.clock.now(),
      );
      this.logger.log(
        `Stripe ${event.type} ${event.id} reconciled session ${reconciled.id} as ${reconciled.status} (payment ${reconciled.payment?.status ?? 'none'})`,
      );
    } else {
      this.logger.log(
        `Stripe ${mode} ${event.type} ${event.id} has no session for ${event.paymentIntentId}`,
      );
    }
    await this.records.markEventProcessed(event.id, event.type);
    return receipt(true);
  }

  private verify(
    gateway: PaymentGateway,
    payload: Buffer | undefined,
    signature: string | undefined,
  ): PaymentWebhookEvent {
    if (!payload || !signature) {
      throw invalidSignature();
    }
    try {
      return gateway.parseWebhookEvent(payload, signature);
    } catch (error) {
      if (error instanceof InvalidPaymentWebhookError) {
        throw invalidSignature();
      }
      throw error;
    }
  }
}

function invalidSignature() {
  return sessionError(
    HttpStatus.BAD_REQUEST,
    SessionErrorCode.INVALID_WEBHOOK_SIGNATURE,
    'Missing or invalid Stripe-Signature',
  );
}

function receipt(processed: boolean): WebhookReceiptDto {
  return Object.assign(new WebhookReceiptDto(), { received: true, processed });
}
