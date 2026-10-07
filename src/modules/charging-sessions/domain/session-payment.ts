import {
  type ChargingLimit,
  energyToSocWh,
  type Vehicle,
} from './charging-limit.js';

export const PaymentStatus = {
  PENDING_AUTHORIZATION: 'PENDING_AUTHORIZATION',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMode = {
  TEST: 'TEST',
  LIVE: 'LIVE',
} as const;

export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];

export const PAYMENT_CURRENCY = 'BRL';
export const MINIMUM_CHARGE_CENTS = 50;

const WH_PER_KWH = 1000;

export interface SessionPayment {
  intentId: string;
  customerId: string;
  mode: PaymentMode;
  autoRefund: boolean;
  status: PaymentStatus;
  currency: string;
  authorizedCents: number;
  capturedCents: number | null;
  failureCode: string | null;
  authorizedAt: Date | null;
  capturedAt: Date | null;
  canceledAt: Date | null;
  refundedCents: number | null;
  refundedAt: Date | null;
}

export type PaymentSettlement =
  | { action: 'CAPTURE'; amountCents: number }
  | { action: 'CANCEL' }
  | { action: 'REFUND'; amountCents: number };

export interface HoldTerms {
  limit: ChargingLimit;
  lockedRateCents: number;
  idleFeeCapCents: number;
  maxEnergyWh: number;
  vehicle?: Vehicle | null;
}

function holdEnergyWh(terms: HoldTerms): number {
  const { limit, maxEnergyWh, vehicle } = terms;
  switch (limit.type) {
    case 'ENERGY':
      return Math.min(limit.energyWh, maxEnergyWh);
    case 'PERCENT':
      return vehicle
        ? Math.min(energyToSocWh(vehicle, limit.socPercent), maxEnergyWh)
        : maxEnergyWh;
    default:
      return maxEnergyWh;
  }
}

export function holdAmountCents(terms: HoldTerms): number {
  const { limit, lockedRateCents, idleFeeCapCents } = terms;
  const energyCents = Math.ceil(
    (holdEnergyWh(terms) * lockedRateCents) / WH_PER_KWH,
  );
  const chargeCents =
    limit.type === 'AMOUNT'
      ? Math.min(limit.amountCents, energyCents)
      : energyCents;
  return Math.max(MINIMUM_CHARGE_CENTS, chargeCents + idleFeeCapCents);
}

export function chargeableEnergyWh(
  authorizedCents: number,
  idleFeeCapCents: number,
  rateCentsPerKwh: number,
): number {
  if (rateCentsPerKwh <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  const energyBudgetCents = Math.max(0, authorizedCents - idleFeeCapCents);
  return Math.floor((energyBudgetCents * WH_PER_KWH) / rateCentsPerKwh);
}

export function settlementFor(
  payment: SessionPayment,
  totalCents: number,
): PaymentSettlement | null {
  switch (payment.status) {
    case PaymentStatus.PENDING_AUTHORIZATION:
    case PaymentStatus.FAILED:
      return { action: 'CANCEL' };
    case PaymentStatus.AUTHORIZED: {
      const amountCents = Math.min(totalCents, payment.authorizedCents);
      return amountCents >= MINIMUM_CHARGE_CENTS
        ? { action: 'CAPTURE', amountCents }
        : { action: 'CANCEL' };
    }
    case PaymentStatus.CAPTURED:
      return payment.autoRefund && (payment.capturedCents ?? 0) > 0
        ? { action: 'REFUND', amountCents: payment.capturedCents ?? 0 }
        : null;
    default:
      return null;
  }
}
