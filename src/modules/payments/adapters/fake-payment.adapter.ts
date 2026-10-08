import { randomUUID } from 'node:crypto';
import {
  type AuthorizationRequest,
  CANCELABLE_INTENT_STATUSES,
  InvalidPaymentWebhookError,
  type PaymentCustomerRequest,
  PaymentGateway,
  type PaymentIntentSnapshot,
  PaymentIntentStatus,
  type PaymentWebhookEvent,
  type RefundSnapshot,
} from '../payment-gateway.port.js';

export const FAKE_WEBHOOK_SIGNATURE = 'fake-stripe-signature';
export const FAKE_PUBLISHABLE_KEY = 'pk_test_fake';
export const FAKE_LIVE_WEBHOOK_SIGNATURE = 'fake-stripe-live-signature';
export const FAKE_LIVE_PUBLISHABLE_KEY = 'pk_live_fake';

export type FakePaymentMode = 'test' | 'live';

const FAKE_MODES: Record<
  FakePaymentMode,
  { publishableKey: string; webhookSignature: string; idPrefix: string }
> = {
  test: {
    publishableKey: FAKE_PUBLISHABLE_KEY,
    webhookSignature: FAKE_WEBHOOK_SIGNATURE,
    idPrefix: 'fake',
  },
  live: {
    publishableKey: FAKE_LIVE_PUBLISHABLE_KEY,
    webhookSignature: FAKE_LIVE_WEBHOOK_SIGNATURE,
    idPrefix: 'live_fake',
  },
};

export interface FakeIntent extends PaymentIntentSnapshot {
  customerId: string;
  sessionId: string;
  currency: string;
}

export interface FakeWebhook {
  payload: Buffer;
  signature: string;
}

export class FakePaymentGateway extends PaymentGateway {
  readonly enabled = true;
  readonly webhooksEnabled = true;
  readonly customers = new Map<string, PaymentCustomerRequest>();
  readonly intents = new Map<string, FakeIntent>();
  readonly refunds = new Map<string, RefundSnapshot & { intentId: string }>();
  readonly publishableKey: string | null;
  private readonly webhookSignature: string;
  private readonly idPrefix: string;

  constructor(readonly mode: FakePaymentMode = 'test') {
    super();
    const settings = FAKE_MODES[mode];
    this.publishableKey = settings.publishableKey;
    this.webhookSignature = settings.webhookSignature;
    this.idPrefix = settings.idPrefix;
  }

  createCustomer(request: PaymentCustomerRequest): Promise<string> {
    const id = `cus_${this.idPrefix}_${shortId()}`;
    this.customers.set(id, request);
    return Promise.resolve(id);
  }

  deleteCustomer(customerId: string): Promise<void> {
    if (!this.customers.delete(customerId)) {
      return Promise.reject(new Error(`No such customer: ${customerId}`));
    }
    return Promise.resolve();
  }

  authorize(request: AuthorizationRequest): Promise<PaymentIntentSnapshot> {
    const id = `pi_${this.idPrefix}_${shortId()}`;
    const intent: FakeIntent = {
      id,
      status: PaymentIntentStatus.REQUIRES_PAYMENT_METHOD,
      amountCents: request.amountCents,
      amountCapturableCents: 0,
      amountReceivedCents: 0,
      clientSecret: `${id}_secret_fake`,
      failureCode: null,
      customerId: request.customerId,
      sessionId: request.sessionId,
      currency: request.currency,
    };
    this.intents.set(id, intent);
    return Promise.resolve(snapshot(intent));
  }

  createEphemeralKey(): Promise<string> {
    return Promise.resolve(`ek_${this.mode}_fake_${shortId()}`);
  }

  retrieve(intentId: string): Promise<PaymentIntentSnapshot> {
    return Promise.resolve(snapshot(this.intent(intentId)));
  }

  capture(
    intentId: string,
    amountCents: number,
  ): Promise<PaymentIntentSnapshot> {
    const intent = this.intent(intentId);
    if (intent.status !== PaymentIntentStatus.REQUIRES_CAPTURE) {
      return Promise.reject(new Error(`${intentId} is ${intent.status}`));
    }
    if (amountCents > intent.amountCapturableCents) {
      return Promise.reject(new Error('Amount exceeds the authorization'));
    }
    intent.status = PaymentIntentStatus.SUCCEEDED;
    intent.amountReceivedCents = amountCents;
    intent.amountCapturableCents = 0;
    return Promise.resolve(snapshot(intent));
  }

  cancel(intentId: string): Promise<PaymentIntentSnapshot> {
    const intent = this.intent(intentId);
    if (CANCELABLE_INTENT_STATUSES.includes(intent.status)) {
      intent.status = PaymentIntentStatus.CANCELED;
      intent.amountCapturableCents = 0;
    }
    return Promise.resolve(snapshot(intent));
  }

  refund(intentId: string, amountCents: number): Promise<RefundSnapshot> {
    const intent = this.intent(intentId);
    if (intent.status !== PaymentIntentStatus.SUCCEEDED) {
      return Promise.reject(new Error(`${intentId} is ${intent.status}`));
    }
    if (amountCents > intent.amountReceivedCents) {
      return Promise.reject(new Error('Amount exceeds the captured amount'));
    }
    const refund = { id: `re_${this.idPrefix}_${shortId()}`, amountCents };
    this.refunds.set(refund.id, { ...refund, intentId });
    return Promise.resolve(refund);
  }

  refundsOf(intentId: string): RefundSnapshot[] {
    return [...this.refunds.values()]
      .filter((refund) => refund.intentId === intentId)
      .map(({ id, amountCents }) => ({ id, amountCents }));
  }

  parseWebhookEvent(payload: Buffer, signature: string): PaymentWebhookEvent {
    if (signature !== this.webhookSignature) {
      throw new InvalidPaymentWebhookError('Invalid fake signature');
    }
    const event = JSON.parse(payload.toString('utf8')) as {
      id: string;
      type: string;
      data: { object: { id: string } };
    };
    return {
      id: event.id,
      type: event.type,
      paymentIntentId: event.data.object.id,
    };
  }

  confirm(intentId: string): FakeIntent {
    const intent = this.intent(intentId);
    intent.status = PaymentIntentStatus.REQUIRES_CAPTURE;
    intent.amountCapturableCents = intent.amountCents;
    intent.failureCode = null;
    return intent;
  }

  decline(intentId: string, failureCode = 'card_declined'): FakeIntent {
    const intent = this.intent(intentId);
    intent.status = PaymentIntentStatus.REQUIRES_PAYMENT_METHOD;
    intent.failureCode = failureCode;
    return intent;
  }

  webhook(type: string, intentId: string, eventId?: string): FakeWebhook {
    const event = {
      id: eventId ?? `evt_fake_${shortId()}`,
      object: 'event',
      type,
      data: { object: { id: intentId, object: 'payment_intent' } },
    };
    return {
      payload: Buffer.from(JSON.stringify(event)),
      signature: this.webhookSignature,
    };
  }

  private intent(intentId: string): FakeIntent {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`No such payment intent: ${intentId}`);
    }
    return intent;
  }
}

function snapshot(intent: FakeIntent): PaymentIntentSnapshot {
  return {
    id: intent.id,
    status: intent.status,
    amountCents: intent.amountCents,
    amountCapturableCents: intent.amountCapturableCents,
    amountReceivedCents: intent.amountReceivedCents,
    clientSecret: intent.clientSecret,
    failureCode: intent.failureCode,
  };
}

function shortId(): string {
  return randomUUID().replaceAll('-', '');
}
