import {
  chargeableEnergyWh,
  holdAmountCents,
  PaymentStatus,
  type SessionPayment,
  settlementFor,
} from './session-payment.js';

const TERMS = {
  lockedRateCents: 284,
  idleFeeCapCents: 3000,
  maxEnergyWh: 60_000,
};

function payment(
  status: SessionPayment['status'],
  authorizedCents = 20_040,
): SessionPayment {
  return {
    intentId: 'pi_1',
    customerId: 'cus_1',
    mode: 'TEST',
    autoRefund: false,
    status,
    currency: 'BRL',
    authorizedCents,
    capturedCents: null,
    failureCode: null,
    authorizedAt: null,
    capturedAt: null,
    canceledAt: null,
    refundedCents: null,
    refundedAt: null,
  };
}

describe('holdAmountCents', () => {
  it('holds the maximum energy at the locked price plus the idle fee cap', () => {
    expect(holdAmountCents({ ...TERMS, limit: { type: 'FULL' } })).toBe(20_040);
  });

  it('holds only the requested energy for energy limits', () => {
    expect(
      holdAmountCents({
        ...TERMS,
        limit: { type: 'ENERGY', energyWh: 10_000 },
      }),
    ).toBe(5840);
    expect(
      holdAmountCents({
        ...TERMS,
        limit: { type: 'ENERGY', energyWh: 90_000 },
      }),
    ).toBe(20_040);
  });

  it('holds the amount limit plus the idle fee cap', () => {
    expect(
      holdAmountCents({
        ...TERMS,
        limit: { type: 'AMOUNT', amountCents: 2000 },
      }),
    ).toBe(5000);
  });

  it('holds the energy up to the target state of charge of a percent limit', () => {
    const vehicle = { batteryCapacityWh: 50_000, socPercent: 42 };
    expect(
      holdAmountCents({
        ...TERMS,
        limit: { type: 'PERCENT', socPercent: 80 },
        vehicle,
      }),
    ).toBe(8396);
    expect(
      holdAmountCents({
        ...TERMS,
        limit: { type: 'PERCENT', socPercent: 100 },
        vehicle: { batteryCapacityWh: 100_000, socPercent: 10 },
      }),
    ).toBe(20_040);
  });

  it('holds the maximum energy for a percent limit without the vehicle', () => {
    expect(
      holdAmountCents({
        ...TERMS,
        limit: { type: 'PERCENT', socPercent: 80 },
        vehicle: null,
      }),
    ).toBe(20_040);
  });

  it('rounds the hold up so it always covers the requested energy', () => {
    const held = holdAmountCents({
      ...TERMS,
      limit: { type: 'ENERGY', energyWh: 10_001 },
    });

    expect(held).toBe(5841);
    expect(chargeableEnergyWh(held, 3000, 284)).toBeGreaterThanOrEqual(10_001);
  });

  it('never holds less than the minimum charge', () => {
    expect(
      holdAmountCents({
        lockedRateCents: 100,
        idleFeeCapCents: 0,
        maxEnergyWh: 60_000,
        limit: { type: 'AMOUNT', amountCents: 10 },
      }),
    ).toBe(50);
  });
});

describe('chargeableEnergyWh', () => {
  it('leaves room for the idle fee cap within the authorization', () => {
    expect(chargeableEnergyWh(20_040, 3000, 284)).toBe(60_000);
    expect(chargeableEnergyWh(5000, 3000, 284)).toBe(7042);
    expect(chargeableEnergyWh(2000, 3000, 284)).toBe(0);
  });
});

describe('settlementFor', () => {
  it('captures the total of an authorized payment', () => {
    expect(settlementFor(payment(PaymentStatus.AUTHORIZED), 1041)).toEqual({
      action: 'CAPTURE',
      amountCents: 1041,
    });
  });

  it('never captures more than the authorization', () => {
    expect(
      settlementFor(payment(PaymentStatus.AUTHORIZED, 5000), 5100),
    ).toEqual({ action: 'CAPTURE', amountCents: 5000 });
  });

  it('releases the hold when less than the minimum charge is due', () => {
    expect(settlementFor(payment(PaymentStatus.AUTHORIZED), 0)).toEqual({
      action: 'CANCEL',
    });
    expect(settlementFor(payment(PaymentStatus.AUTHORIZED), 49)).toEqual({
      action: 'CANCEL',
    });
  });

  it('cancels payments that were never authorized', () => {
    expect(
      settlementFor(payment(PaymentStatus.PENDING_AUTHORIZATION), 0),
    ).toEqual({ action: 'CANCEL' });
    expect(settlementFor(payment(PaymentStatus.FAILED), 0)).toEqual({
      action: 'CANCEL',
    });
  });

  it('has nothing to settle once captured or canceled', () => {
    expect(settlementFor(payment(PaymentStatus.CAPTURED), 1041)).toBeNull();
    expect(settlementFor(payment(PaymentStatus.CANCELED), 0)).toBeNull();
  });

  it('refunds the captured amount of auto refund payments', () => {
    const captured = {
      ...payment(PaymentStatus.CAPTURED),
      mode: 'LIVE' as const,
      autoRefund: true,
      capturedCents: 1041,
    };

    expect(settlementFor(captured, 1041)).toEqual({
      action: 'REFUND',
      amountCents: 1041,
    });
    expect(
      settlementFor({ ...captured, status: PaymentStatus.REFUNDED }, 1041),
    ).toBeNull();
    expect(settlementFor({ ...captured, capturedCents: 0 }, 0)).toBeNull();
  });
});
