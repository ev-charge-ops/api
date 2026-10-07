import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { StripePaymentGateway } from './adapters/stripe-payment.adapter.js';
import {
  DisabledPaymentGateway,
  PaymentsUnavailableError,
} from './payment-gateway.port.js';
import { createPaymentGateway } from './payments.module.js';

function config(values: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => values[key] ?? '',
  } as unknown as ConfigService<Env, true>;
}

describe('createPaymentGateway', () => {
  it('disables payments without a Stripe secret key', async () => {
    const gateway = createPaymentGateway(config({}));

    expect(gateway).toBeInstanceOf(DisabledPaymentGateway);
    expect(gateway.enabled).toBe(false);
    expect(gateway.webhooksEnabled).toBe(false);
    await expect(gateway.retrieve('pi_1')).rejects.toBeInstanceOf(
      PaymentsUnavailableError,
    );
  });

  it('uses Stripe when the secret key is set', () => {
    const gateway = createPaymentGateway(
      config({
        STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
        STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
        STRIPE_PUBLISHABLE_KEY: 'pk_test_unit_test_only',
      }),
    );

    expect(gateway).toBeInstanceOf(StripePaymentGateway);
    expect(gateway.enabled).toBe(true);
    expect(gateway.webhooksEnabled).toBe(true);
    expect(gateway.publishableKey).toBe('pk_test_unit_test_only');
  });
});
