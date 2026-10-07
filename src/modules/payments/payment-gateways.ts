import type { PaymentMode } from '../../generated/prisma/enums.js';
import type { PaymentGateway } from './payment-gateway.port.js';

export class PaymentGateways {
  constructor(private readonly gateways: Record<PaymentMode, PaymentGateway>) {}

  for(mode: PaymentMode): PaymentGateway {
    return this.gateways[mode];
  }
}
