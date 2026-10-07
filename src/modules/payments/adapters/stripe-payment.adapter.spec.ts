import Stripe from 'stripe';
import {
  InvalidPaymentWebhookError,
  PaymentsUnavailableError,
} from '../payment-gateway.port.js';
import { StripePaymentGateway } from './stripe-payment.adapter.js';

const WEBHOOK_SECRET = 'whsec_unit_test_only';
const OPTIONS = {
  secretKey: 'sk_test_unit_test_only',
  webhookSecret: WEBHOOK_SECRET,
  publishableKey: '',
};

function intent(overrides: Partial<Stripe.PaymentIntent> = {}) {
  return {
    id: 'pi_1',
    status: 'requires_payment_method',
    amount: 20_040,
    amount_capturable: 0,
    amount_received: 0,
    client_secret: 'pi_1_secret_abc',
    last_payment_error: null,
    ...overrides,
  } as Stripe.PaymentIntent;
}

function stubClient() {
  const paymentIntents = {
    create: vi.fn().mockResolvedValue(intent()),
    retrieve: vi.fn().mockResolvedValue(intent()),
    capture: vi.fn(),
    cancel: vi.fn().mockResolvedValue(intent({ status: 'canceled' })),
  };
  const client = new Stripe(OPTIONS.secretKey);
  Object.assign(client, { paymentIntents });
  return { client, paymentIntents };
}

function signedEvent(type: string, objectId = 'pi_1') {
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type,
    data: { object: { id: objectId, object: 'payment_intent' } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return { payload: Buffer.from(payload), signature };
}

describe('StripePaymentGateway', () => {
  it('creates a manual capture card hold in BRL for the session', async () => {
    const { client, paymentIntents } = stubClient();
    const gateway = new StripePaymentGateway(OPTIONS, client);

    const snapshot = await gateway.authorize({
      sessionId: 'session-1',
      customerId: 'cus_1',
      amountCents: 20_040,
      currency: 'BRL',
      description: 'EV ChargeOps · Visitantes',
    });

    expect(paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 20_040,
        currency: 'brl',
        customer: 'cus_1',
        capture_method: 'manual',
        allowed_payment_method_types: ['card'],
        description: 'EV ChargeOps · Visitantes',
        metadata: { sessionId: 'session-1' },
      },
      { idempotencyKey: 'session-session-1-authorization' },
    );
    expect(snapshot).toEqual({
      id: 'pi_1',
      status: 'requires_payment_method',
      amountCents: 20_040,
      amountCapturableCents: 0,
      amountReceivedCents: 0,
      clientSecret: 'pi_1_secret_abc',
      failureCode: null,
    });
  });

  it('reports the decline code of the last failed attempt', async () => {
    const { client, paymentIntents } = stubClient();
    paymentIntents.retrieve.mockResolvedValue(
      intent({
        last_payment_error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
        } as Stripe.PaymentIntent.LastPaymentError,
      }),
    );
    const gateway = new StripePaymentGateway(OPTIONS, client);

    expect((await gateway.retrieve('pi_1')).failureCode).toBe(
      'insufficient_funds',
    );
  });

  it('only cancels intents that can still be canceled', async () => {
    const { client, paymentIntents } = stubClient();
    const gateway = new StripePaymentGateway(OPTIONS, client);

    expect((await gateway.cancel('pi_1')).status).toBe('canceled');
    expect(paymentIntents.cancel).toHaveBeenCalledOnce();

    paymentIntents.retrieve.mockResolvedValue(intent({ status: 'succeeded' }));
    expect((await gateway.cancel('pi_1')).status).toBe('succeeded');
    expect(paymentIntents.cancel).toHaveBeenCalledOnce();
  });

  it('verifies the webhook signature over the raw body', () => {
    const gateway = new StripePaymentGateway(OPTIONS);
    const { payload, signature } = signedEvent(
      'payment_intent.amount_capturable_updated',
    );

    expect(gateway.parseWebhookEvent(payload, signature)).toEqual({
      id: 'evt_1',
      type: 'payment_intent.amount_capturable_updated',
      paymentIntentId: 'pi_1',
    });
  });

  it('rejects tampered or unsigned webhooks', () => {
    const gateway = new StripePaymentGateway(OPTIONS);
    const { signature } = signedEvent('payment_intent.succeeded');
    const tampered = signedEvent('payment_intent.succeeded', 'pi_2').payload;

    expect(() => gateway.parseWebhookEvent(tampered, signature)).toThrow(
      InvalidPaymentWebhookError,
    );
    expect(() =>
      gateway.parseWebhookEvent(Buffer.from('{}'), 'not-a-signature'),
    ).toThrow(InvalidPaymentWebhookError);
  });

  it('ignores the intent id of other event types', () => {
    const gateway = new StripePaymentGateway(OPTIONS);
    const { payload, signature } = signedEvent('charge.succeeded', 'ch_1');

    expect(gateway.parseWebhookEvent(payload, signature).paymentIntentId).toBe(
      null,
    );
  });

  it('refuses webhooks when the secret is not configured', () => {
    const gateway = new StripePaymentGateway({ ...OPTIONS, webhookSecret: '' });
    const { payload, signature } = signedEvent('payment_intent.succeeded');

    expect(gateway.webhooksEnabled).toBe(false);
    expect(() => gateway.parseWebhookEvent(payload, signature)).toThrow(
      PaymentsUnavailableError,
    );
  });

  it('exposes the publishable key only when configured', () => {
    expect(new StripePaymentGateway(OPTIONS).publishableKey).toBeNull();
    expect(
      new StripePaymentGateway({ ...OPTIONS, publishableKey: 'pk_test_1' })
        .publishableKey,
    ).toBe('pk_test_1');
  });
});
