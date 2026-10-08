import Stripe from 'stripe';
import {
  type AuthorizationRequest,
  CANCELABLE_INTENT_STATUSES,
  InvalidPaymentWebhookError,
  type PaymentCustomerRequest,
  PaymentGateway,
  type PaymentIntentSnapshot,
  PaymentIntentStatus,
  type PaymentWebhookEvent,
  PaymentsUnavailableError,
  type RefundSnapshot,
} from '../payment-gateway.port.js';

export interface StripePaymentOptions {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}

const PAYMENT_INTENT_EVENT_PREFIX = 'payment_intent.';

export class StripePaymentGateway extends PaymentGateway {
  readonly enabled = true;
  readonly webhooksEnabled: boolean;
  readonly publishableKey: string | null;
  private readonly webhookSecret: string;
  private readonly client: Stripe;

  constructor(options: StripePaymentOptions, client?: Stripe) {
    super();
    this.client = client ?? new Stripe(options.secretKey);
    this.webhookSecret = options.webhookSecret;
    this.webhooksEnabled = options.webhookSecret.length > 0;
    this.publishableKey = options.publishableKey || null;
  }

  async createCustomer(request: PaymentCustomerRequest): Promise<string> {
    const customer = await this.client.customers.create(
      {
        email: request.email,
        name: request.name,
        metadata: { userId: request.userId },
      },
      { idempotencyKey: `customer-${request.userId}` },
    );
    return customer.id;
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.client.customers.del(customerId);
  }

  async authorize(
    request: AuthorizationRequest,
  ): Promise<PaymentIntentSnapshot> {
    const intent = await this.client.paymentIntents.create(
      {
        amount: request.amountCents,
        currency: request.currency.toLowerCase(),
        customer: request.customerId,
        capture_method: 'manual',
        allowed_payment_method_types: ['card'],
        description: request.description,
        metadata: { sessionId: request.sessionId },
      },
      { idempotencyKey: `session-${request.sessionId}-authorization` },
    );
    return toSnapshot(intent);
  }

  async createEphemeralKey(customerId: string): Promise<string> {
    const key = await this.client.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: Stripe.API_VERSION },
    );
    if (!key.secret) {
      throw new Error('Stripe did not return the ephemeral key secret');
    }
    return key.secret;
  }

  async retrieve(intentId: string): Promise<PaymentIntentSnapshot> {
    return toSnapshot(await this.client.paymentIntents.retrieve(intentId));
  }

  async capture(
    intentId: string,
    amountCents: number,
  ): Promise<PaymentIntentSnapshot> {
    const intent = await this.client.paymentIntents.capture(
      intentId,
      { amount_to_capture: amountCents },
      { idempotencyKey: `${intentId}-capture-${amountCents}` },
    );
    return toSnapshot(intent);
  }

  async cancel(intentId: string): Promise<PaymentIntentSnapshot> {
    const current = await this.client.paymentIntents.retrieve(intentId);
    if (
      !CANCELABLE_INTENT_STATUSES.some((status) => status === current.status)
    ) {
      return toSnapshot(current);
    }
    return toSnapshot(await this.client.paymentIntents.cancel(intentId));
  }

  async refund(intentId: string, amountCents: number): Promise<RefundSnapshot> {
    const refund = await this.client.refunds.create(
      { payment_intent: intentId, amount: amountCents },
      { idempotencyKey: `${intentId}-refund-${amountCents}` },
    );
    return { id: refund.id, amountCents: refund.amount };
  }

  parseWebhookEvent(payload: Buffer, signature: string): PaymentWebhookEvent {
    if (!this.webhooksEnabled) {
      throw new PaymentsUnavailableError('Stripe webhooks are not configured');
    }
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      throw new InvalidPaymentWebhookError(String(error));
    }
    const object = event.data.object as { id?: unknown };
    return {
      id: event.id,
      type: event.type,
      paymentIntentId:
        event.type.startsWith(PAYMENT_INTENT_EVENT_PREFIX) &&
        typeof object.id === 'string'
          ? object.id
          : null,
    };
  }
}

function toSnapshot(intent: Stripe.PaymentIntent): PaymentIntentSnapshot {
  const error = intent.last_payment_error;
  return {
    id: intent.id,
    status: toStatus(intent.status),
    amountCents: intent.amount,
    amountCapturableCents: intent.amount_capturable,
    amountReceivedCents: intent.amount_received,
    clientSecret: intent.client_secret,
    failureCode: error ? (error.decline_code ?? error.code ?? 'unknown') : null,
  };
}

function toStatus(status: Stripe.PaymentIntent.Status): PaymentIntentStatus {
  const known = Object.values(PaymentIntentStatus).find(
    (value) => value === status,
  );
  return known ?? PaymentIntentStatus.PROCESSING;
}
