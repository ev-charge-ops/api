import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../common/clock/clock.js';
import type { Env } from '../../config/env.schema.js';
import {
  type PaymentGateway,
  type PaymentIntentSnapshot,
  PaymentIntentStatus,
} from '../payments/payment-gateway.port.js';
import { PaymentGateways } from '../payments/payment-gateways.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import {
  type PayerProfile,
  PaymentRecordsRepository,
} from './database/payment-records.repository.js';
import type { Vehicle } from './domain/charging-limit.js';
import type { ChargingSession } from './domain/charging-session.entity.js';
import {
  holdAmountCents,
  PAYMENT_CURRENCY,
  type PaymentSettlement,
  type SessionPayment,
} from './domain/session-payment.js';
import { PaymentSheetDto } from './dto/payment-sheet.dto.js';
import { SessionEvents, snapshotOf } from './session-events.js';
import { SessionStarter } from './session-starter.js';

export const MERCHANT_DISPLAY_NAME = 'EV ChargeOps';

const WH_PER_KWH = 1000;
const MAX_SAVE_ATTEMPTS = 3;
const MAX_SETTLEMENT_STEPS = 2;

@Injectable()
export class SessionPayments {
  private readonly logger = new Logger(SessionPayments.name);
  private readonly holdEnergyWh: number;
  readonly authorizationTimeoutMinutes: number;

  constructor(
    private readonly gateways: PaymentGateways,
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

  async availableFor(userId: string): Promise<boolean> {
    const payer = await this.records.findPayer(userId);
    return this.gateways.for(payer.paymentMode).enabled;
  }

  async open(
    session: ChargingSession,
    vehicle: Vehicle | null = null,
  ): Promise<PaymentSheetDto> {
    const props = session.toProps();
    const payer = await this.records.findPayer(props.userId);
    const gateway = this.gateways.for(payer.paymentMode);
    const customerId = await this.customerFor(props.userId, payer, gateway);
    const intent = await gateway.authorize({
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
      mode: payer.paymentMode,
      autoRefund: payer.autoRefund,
      amountCents: intent.amountCents,
    });
    await this.sessions.save(session, []);
    return this.sheet(gateway, customerId, intent);
  }

  async sheetFor(session: ChargingSession): Promise<PaymentSheetDto> {
    const payment = session.payment;
    if (!payment) {
      throw new Error('Session has no payment');
    }
    const gateway = this.gateways.for(payment.mode);
    const intent = await gateway.retrieve(payment.intentId);
    return this.sheet(gateway, payment.customerId, intent);
  }

  async reconcile(
    session: ChargingSession,
    now: Date,
  ): Promise<ChargingSession> {
    const payment = session.payment;
    if (!payment) {
      return session;
    }
    const intent = await this.gateways
      .for(payment.mode)
      .retrieve(payment.intentId);
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
    for (let step = 0; step < MAX_SETTLEMENT_STEPS; step++) {
      const settlement = session.paymentSettlement;
      const payment = session.payment;
      if (!settlement || !payment) {
        return;
      }
      if (!(await this.applySettlement(session, payment, settlement))) {
        return;
      }
    }
  }

  private async applySettlement(
    session: ChargingSession,
    payment: SessionPayment,
    settlement: PaymentSettlement,
  ): Promise<boolean> {
    const gateway = this.gateways.for(payment.mode);
    const before = snapshotOf(session);
    try {
      switch (settlement.action) {
        case 'CAPTURE':
          applyIntent(
            session,
            await gateway.capture(payment.intentId, settlement.amountCents),
            this.clock.now(),
          );
          break;
        case 'CANCEL':
          applyIntent(
            session,
            await gateway.cancel(payment.intentId),
            this.clock.now(),
          );
          break;
        case 'REFUND': {
          const refund = await gateway.refund(
            payment.intentId,
            settlement.amountCents,
          );
          session.recordPaymentRefunded(refund.amountCents, this.clock.now());
          this.logger.log(
            `Refunded ${refund.amountCents} cents of payment ${payment.intentId} automatically (${refund.id})`,
          );
          break;
        }
      }
      if (!(await this.sessions.save(session, []))) {
        return false;
      }
      await this.events.changed(before, session);
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not ${settlement.action.toLowerCase()} payment ${payment.intentId}: ${String(error)}`,
      );
      return false;
    }
  }

  private async customerFor(
    userId: string,
    payer: PayerProfile,
    gateway: PaymentGateway,
  ): Promise<string> {
    const mode = payer.paymentMode;
    const existing =
      mode === 'LIVE' ? payer.stripeLiveCustomerId : payer.stripeCustomerId;
    if (existing) {
      return existing;
    }
    const customerId = await gateway.createCustomer({
      userId,
      email: payer.email,
      name: payer.name,
    });
    await this.records.saveCustomerId(userId, mode, customerId);
    return customerId;
  }

  private async sheet(
    gateway: PaymentGateway,
    customerId: string,
    intent: PaymentIntentSnapshot,
  ): Promise<PaymentSheetDto> {
    if (!intent.clientSecret) {
      throw new Error(`Payment ${intent.id} has no client secret`);
    }
    return Object.assign(new PaymentSheetDto(), {
      paymentIntentClientSecret: intent.clientSecret,
      customerId,
      customerEphemeralKeySecret: await gateway.createEphemeralKey(customerId),
      publishableKey: gateway.publishableKey,
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
