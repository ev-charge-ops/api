import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { StripePaymentGateway } from './adapters/stripe-payment.adapter.js';
import {
  DisabledPaymentGateway,
  PaymentsUnavailableError,
} from './payment-gateway.port.js';
import { createPaymentGateways } from './payments.module.js';

function config(values: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => values[key] ?? '',
  } as unknown as ConfigService<Env, true>;
}

const TEST_KEYS = {
  STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_unit_test_only',
};

const LIVE_KEYS = {
  STRIPE_LIVE_SECRET_KEY: 'sk_live_unit_test_only',
  STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_live_unit_test_only',
  STRIPE_LIVE_PUBLISHABLE_KEY: 'pk_live_unit_test_only',
};

describe('createPaymentGateways', () => {
  it('disables both modes without Stripe secret keys', async () => {
    const gateways = createPaymentGateways(config({}));

    for (const mode of ['TEST', 'LIVE'] as const) {
      const gateway = gateways.for(mode);
      expect(gateway).toBeInstanceOf(DisabledPaymentGateway);
      expect(gateway.enabled).toBe(false);
      expect(gateway.webhooksEnabled).toBe(false);
      await expect(gateway.retrieve('pi_1')).rejects.toBeInstanceOf(
        PaymentsUnavailableError,
      );
    }
  });

  it('uses Stripe in test mode with the test keys only', () => {
    const gateways = createPaymentGateways(config(TEST_KEYS));

    const test = gateways.for('TEST');
    expect(test).toBeInstanceOf(StripePaymentGateway);
    expect(test.enabled).toBe(true);
    expect(test.webhooksEnabled).toBe(true);
    expect(test.publishableKey).toBe('pk_test_unit_test_only');
    expect(gateways.for('LIVE')).toBeInstanceOf(DisabledPaymentGateway);
  });

  it('uses the live keys for the live mode', () => {
    const gateways = createPaymentGateways(
      config({ ...TEST_KEYS, ...LIVE_KEYS }),
    );

    const live = gateways.for('LIVE');
    expect(live).toBeInstanceOf(StripePaymentGateway);
    expect(live.enabled).toBe(true);
    expect(live.webhooksEnabled).toBe(true);
    expect(live.publishableKey).toBe('pk_live_unit_test_only');
    expect(gateways.for('TEST').publishableKey).toBe('pk_test_unit_test_only');
  });

  it('enables live payments without webhooks when only the live secret key is set', () => {
    const gateways = createPaymentGateways(
      config({ STRIPE_LIVE_SECRET_KEY: 'sk_live_unit_test_only' }),
    );

    expect(gateways.for('LIVE').enabled).toBe(true);
    expect(gateways.for('LIVE').webhooksEnabled).toBe(false);
    expect(gateways.for('LIVE').publishableKey).toBeNull();
    expect(gateways.for('TEST').enabled).toBe(false);
  });
});
