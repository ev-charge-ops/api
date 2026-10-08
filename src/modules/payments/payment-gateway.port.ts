export const PaymentIntentStatus = {
  REQUIRES_PAYMENT_METHOD: 'requires_payment_method',
  REQUIRES_CONFIRMATION: 'requires_confirmation',
  REQUIRES_ACTION: 'requires_action',
  PROCESSING: 'processing',
  REQUIRES_CAPTURE: 'requires_capture',
  CANCELED: 'canceled',
  SUCCEEDED: 'succeeded',
} as const;

export type PaymentIntentStatus =
  (typeof PaymentIntentStatus)[keyof typeof PaymentIntentStatus];

export const CANCELABLE_INTENT_STATUSES: PaymentIntentStatus[] = [
  PaymentIntentStatus.REQUIRES_PAYMENT_METHOD,
  PaymentIntentStatus.REQUIRES_CONFIRMATION,
  PaymentIntentStatus.REQUIRES_ACTION,
  PaymentIntentStatus.REQUIRES_CAPTURE,
];

export interface PaymentIntentSnapshot {
  id: string;
  status: PaymentIntentStatus;
  amountCents: number;
  amountCapturableCents: number;
  amountReceivedCents: number;
  clientSecret: string | null;
  failureCode: string | null;
}

export interface PaymentCustomerRequest {
  userId: string;
  email: string;
  name: string;
}

export interface AuthorizationRequest {
  sessionId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  description: string;
}

export interface RefundSnapshot {
  id: string;
  amountCents: number;
}

export interface PaymentWebhookEvent {
  id: string;
  type: string;
  paymentIntentId: string | null;
}

export class PaymentsUnavailableError extends Error {
  override readonly name = 'PaymentsUnavailableError';
}

export class InvalidPaymentWebhookError extends Error {
  override readonly name = 'InvalidPaymentWebhookError';
}

export abstract class PaymentGateway {
  abstract readonly enabled: boolean;

  abstract readonly webhooksEnabled: boolean;

  abstract readonly publishableKey: string | null;

  abstract createCustomer(request: PaymentCustomerRequest): Promise<string>;

  abstract authorize(
    request: AuthorizationRequest,
  ): Promise<PaymentIntentSnapshot>;

  abstract createEphemeralKey(customerId: string): Promise<string>;

  abstract retrieve(intentId: string): Promise<PaymentIntentSnapshot>;

  abstract capture(
    intentId: string,
    amountCents: number,
  ): Promise<PaymentIntentSnapshot>;

  abstract cancel(intentId: string): Promise<PaymentIntentSnapshot>;

  abstract refund(
    intentId: string,
    amountCents: number,
  ): Promise<RefundSnapshot>;

  abstract parseWebhookEvent(
    payload: Buffer,
    signature: string,
  ): PaymentWebhookEvent;
}

export class DisabledPaymentGateway extends PaymentGateway {
  readonly enabled = false;
  readonly webhooksEnabled = false;
  readonly publishableKey = null;

  createCustomer(): Promise<string> {
    return Promise.reject(unavailable());
  }

  authorize(): Promise<PaymentIntentSnapshot> {
    return Promise.reject(unavailable());
  }

  createEphemeralKey(): Promise<string> {
    return Promise.reject(unavailable());
  }

  retrieve(): Promise<PaymentIntentSnapshot> {
    return Promise.reject(unavailable());
  }

  capture(): Promise<PaymentIntentSnapshot> {
    return Promise.reject(unavailable());
  }

  cancel(): Promise<PaymentIntentSnapshot> {
    return Promise.reject(unavailable());
  }

  refund(): Promise<RefundSnapshot> {
    return Promise.reject(unavailable());
  }

  parseWebhookEvent(): PaymentWebhookEvent {
    throw unavailable();
  }
}

function unavailable(): PaymentsUnavailableError {
  return new PaymentsUnavailableError('Payments are not configured');
}
