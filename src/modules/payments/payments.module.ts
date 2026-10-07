import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import {
  StripePaymentGateway,
  type StripePaymentOptions,
} from './adapters/stripe-payment.adapter.js';
import {
  DisabledPaymentGateway,
  PaymentGateway,
} from './payment-gateway.port.js';
import { PaymentGateways } from './payment-gateways.js';

export function createPaymentGateway(
  options: StripePaymentOptions,
): PaymentGateway {
  if (!options.secretKey) {
    return new DisabledPaymentGateway();
  }
  return new StripePaymentGateway(options);
}

export function createPaymentGateways(
  config: ConfigService<Env, true>,
): PaymentGateways {
  return new PaymentGateways({
    TEST: createPaymentGateway({
      secretKey: config.get('STRIPE_SECRET_KEY', { infer: true }),
      webhookSecret: config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
      publishableKey: config.get('STRIPE_PUBLISHABLE_KEY', { infer: true }),
    }),
    LIVE: createPaymentGateway({
      secretKey: config.get('STRIPE_LIVE_SECRET_KEY', { infer: true }),
      webhookSecret: config.get('STRIPE_LIVE_WEBHOOK_SECRET', { infer: true }),
      publishableKey: config.get('STRIPE_LIVE_PUBLISHABLE_KEY', {
        infer: true,
      }),
    }),
  });
}

@Module({
  providers: [
    {
      provide: PaymentGateways,
      inject: [ConfigService],
      useFactory: createPaymentGateways,
    },
  ],
  exports: [PaymentGateways],
})
export class PaymentsModule {}
