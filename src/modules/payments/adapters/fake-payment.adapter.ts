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
} from '../payment-gateway.port.js';

export const FAKE_WEBHOOK_SIGNATURE = 'fake-stripe-signature';
export const FAKE_PUBLISHABLE_KEY = 'pk_test_fake';

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

  constructor(readonly publishableKey: string | null = FAKE_PUBLISHABLE_KEY) {
    super();
  }

  createCustomer(request: PaymentCustomerRequest): Promise<string> {
    const id = `cus_fake_${shortId()}`;
    this.customers.set(id, request);
    return Promise.resolve(id);
  }

  authorize(request: AuthorizationRequest): Promise<PaymentIntentSnapshot> {
    const id = `pi_fake_${shortId()}`;
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

  createEphemeralKey(customerId: string): Promise<string> {
    return Promise.resolve(`ek_test_fake_${shortId()}`);
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

  parseWebhookEvent(payload: Buffer, signature: string): PaymentWebhookEvent {
    if (signature !== FAKE_WEBHOOK_SIGNATURE) {
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
      signature: FAKE_WEBHOOK_SIGNATURE,
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
