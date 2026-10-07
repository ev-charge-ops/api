import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { StripePaymentGateway } from './adapters/stripe-payment.adapter.js';
import {
  DisabledPaymentGateway,
  PaymentGateway,
} from './payment-gateway.port.js';

export function createPaymentGateway(
  config: ConfigService<Env, true>,
): PaymentGateway {
  const secretKey = config.get('STRIPE_SECRET_KEY', { infer: true });
  if (!secretKey) {
    return new DisabledPaymentGateway();
  }
  return new StripePaymentGateway({
    secretKey,
    webhookSecret: config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
    publishableKey: config.get('STRIPE_PUBLISHABLE_KEY', { infer: true }),
  });
}

@Module({
  providers: [
    {
      provide: PaymentGateway,
      inject: [ConfigService],
      useFactory: createPaymentGateway,
    },
  ],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
