import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../common/clock/clock.js';
import type { Env } from '../../config/env.schema.js';
import {
  PaymentGateway,
  type PaymentIntentSnapshot,
  PaymentIntentStatus,
} from '../payments/payment-gateway.port.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import { PaymentRecordsRepository } from './database/payment-records.repository.js';
import type { Vehicle } from './domain/charging-limit.js';
import type { ChargingSession } from './domain/charging-session.entity.js';
import { holdAmountCents, PAYMENT_CURRENCY } from './domain/session-payment.js';
import { PaymentSheetDto } from './dto/payment-sheet.dto.js';
import { SessionEvents, snapshotOf } from './session-events.js';
import { SessionStarter } from './session-starter.js';

export const MERCHANT_DISPLAY_NAME = 'EV ChargeOps';

const WH_PER_KWH = 1000;
const MAX_SAVE_ATTEMPTS = 3;

@Injectable()
export class SessionPayments {
  private readonly logger = new Logger(SessionPayments.name);
  private readonly holdEnergyWh: number;
  readonly authorizationTimeoutMinutes: number;

  constructor(
    private readonly gateway: PaymentGateway,
    private readonly sessions: ChargingSessionRepository,
    private readonly records: PaymentRecordsRepository,
    private readonly starter: SessionStarter,
    private readonly clock: Clock,
    private readonly events: SessionEvents,
    config: ConfigService<Env, true>,
  ) {
    this.holdEnergyWh = Math.round(
      config.get('PAYMENT_HOLD_ENERGY_KWH', { infer: true }) * WH_PER_KWH,
    );
    this.authorizationTimeoutMinutes = config.get(
      'PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES',
      { infer: true },
    );
  }

  get enabled(): boolean {
    return this.gateway.enabled;
  }

  async open(
    session: ChargingSession,
    vehicle: Vehicle | null = null,
  ): Promise<PaymentSheetDto> {
    const props = session.toProps();
    const customerId = await this.customerFor(props.userId);
    const intent = await this.gateway.authorize({
      sessionId: props.id,
      customerId,
      amountCents: holdAmountCents({
        limit: props.limit,
        lockedRateCents: props.lockedRateCents,
        idleFeeCapCents: props.idleFeeCapCents,
        maxEnergyWh: this.holdEnergyWh,
        vehicle,
      }),
      currency: PAYMENT_CURRENCY,
      description: `EV ChargeOps · ${props.chargePointName}`,
    });
    session.attachPayment({
      intentId: intent.id,
      customerId,
      amountCents: intent.amountCents,
    });
    await this.sessions.save(session, []);
    return this.sheet(customerId, intent);
  }

  async sheetFor(session: ChargingSession): Promise<PaymentSheetDto> {
    const payment = session.payment;
    if (!payment) {
      throw new Error('Session has no payment');
    }
    const intent = await this.gateway.retrieve(payment.intentId);
    return this.sheet(payment.customerId, intent);
  }

  async reconcile(
    session: ChargingSession,
    now: Date,
  ): Promise<ChargingSession> {
    const payment = session.payment;
    if (!payment) {
      return session;
    }
    const intent = await this.gateway.retrieve(payment.intentId);
    let current = session;
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const before = snapshotOf(current);
      const startCharging = applyIntent(current, intent, now);
      if (await this.sessions.save(current, [])) {
        await this.events.changed(before, current);
        if (startCharging) {
          await this.starter.start(current);
        }
        await this.settle(current);
        return current;
      }
      const reloaded = await this.sessions.findById(current.id);
      if (!reloaded) {
        return current;
      }
      current = reloaded;
    }
    throw new Error(`Session ${session.id} kept changing while reconciling`);
  }

  async settle(session: ChargingSession): Promise<void> {
    const settlement = session.paymentSettlement;
    const payment = session.payment;
    if (!settlement || !payment) {
      return;
    }
    const before = snapshotOf(session);
    try {
      const intent =
        settlement.action === 'CAPTURE'
          ? await this.gateway.capture(payment.intentId, settlement.amountCents)
          : await this.gateway.cancel(payment.intentId);
      applyIntent(session, intent, this.clock.now());
      if (await this.sessions.save(session, [])) {
        await this.events.changed(before, session);
      }
    } catch (error) {
      this.logger.warn(
        `Could not ${settlement.action.toLowerCase()} payment ${payment.intentId}: ${String(error)}`,
      );
    }
  }

  private async customerFor(userId: string): Promise<string> {
    const payer = await this.records.findPayer(userId);
    if (payer.stripeCustomerId) {
      return payer.stripeCustomerId;
    }
    const customerId = await this.gateway.createCustomer({
      userId,
      email: payer.email,
      name: payer.name,
    });
    await this.records.saveCustomerId(userId, customerId);
    return customerId;
  }

  private async sheet(
    customerId: string,
    intent: PaymentIntentSnapshot,
  ): Promise<PaymentSheetDto> {
    if (!intent.clientSecret) {
      throw new Error(`Payment ${intent.id} has no client secret`);
    }
    return Object.assign(new PaymentSheetDto(), {
      paymentIntentClientSecret: intent.clientSecret,
      customerId,
      customerEphemeralKeySecret:
        await this.gateway.createEphemeralKey(customerId),
      publishableKey: this.gateway.publishableKey,
      merchantDisplayName: MERCHANT_DISPLAY_NAME,
    });
  }
}

function applyIntent(
  session: ChargingSession,
  intent: PaymentIntentSnapshot,
  at: Date,
): boolean {
  switch (intent.status) {
    case PaymentIntentStatus.REQUIRES_CAPTURE:
      return session.recordPaymentAuthorized(intent.amountCapturableCents, at);
    case PaymentIntentStatus.SUCCEEDED:
      session.recordPaymentCaptured(intent.amountReceivedCents, at);
      return false;
    case PaymentIntentStatus.CANCELED:
      session.recordPaymentCanceled(at);
      return false;
    case PaymentIntentStatus.REQUIRES_PAYMENT_METHOD:
      if (intent.failureCode) {
        session.recordPaymentFailed(intent.failureCode);
      }
      return false;
    default:
      return false;
  }
}
