import {
  ChargingSession,
  InvalidSessionTransitionError,
} from './charging-session.entity.js';

const REQUESTED_AT = new Date('2026-10-07T22:00:00.000Z');
const VEHICLE = { batteryCapacityWh: 80_000, socPercent: 10 };

function at(minutes: number): Date {
  return new Date(REQUESTED_AT.getTime() + minutes * 60_000);
}

function commercialSession(autoRefund = false): ChargingSession {
  const session = ChargingSession.create({
    id: 'session-1',
    userId: 'user-1',
    chargePointId: 'point-1',
    chargePointCode: 'V-01',
    chargePointName: 'Visitantes · Vaga 1',
    chargerSerialNumber: 'GW-9',
    organizationId: 'organization-1',
    unitLabel: null,
    regime: 'COMMERCIAL',
    limit: { type: 'FULL' },
    allocatedPowerKw: 22,
    timeScale: 1,
    lockedRateCents: 284,
    demandFactor: 1.5,
    demandFactorSource: 'RULE',
    demandModelVersion: null,
    idleFeeCentsPerMinute: 25,
    idleFeeCapCents: 3000,
    gracePeriodMinutes: 10,
    startedAt: REQUESTED_AT,
  });
  session.attachPayment({
    intentId: 'pi_1',
    customerId: 'cus_1',
    mode: autoRefund ? 'LIVE' : 'TEST',
    autoRefund,
    amountCents: 20_040,
  });
  return session;
}

function chargingSession(autoRefund = false): ChargingSession {
  const session = commercialSession(autoRefund);
  session.recordPaymentAuthorized(20_040, at(1));
  session.activate('tx-1', VEHICLE, at(2));
  return session;
}

describe('ChargingSession payments', () => {
  it('waits for the card hold before charging commercial sessions', () => {
    const session = commercialSession();

    expect(session.requiresPayment).toBe(true);
    expect(session.toProps()).toMatchObject({
      status: 'AWAITING_PAYMENT',
      payment: {
        intentId: 'pi_1',
        customerId: 'cus_1',
        status: 'PENDING_AUTHORIZATION',
        currency: 'BRL',
        authorizedCents: 20_040,
        capturedCents: null,
      },
    });
    expect(() => session.activate('tx-1', VEHICLE, at(1))).toThrow(
      InvalidSessionTransitionError,
    );
  });

  it('moves to pending once authorized, only the first time', () => {
    const session = commercialSession();

    expect(session.recordPaymentAuthorized(20_040, at(1))).toBe(true);
    expect(session.recordPaymentAuthorized(20_040, at(2))).toBe(false);
    expect(session.toProps()).toMatchObject({
      status: 'PENDING',
      payment: { status: 'AUTHORIZED', authorizedAt: at(1) },
    });
  });

  it('starts the clock when charging begins and caps the energy to the hold', () => {
    const session = chargingSession();

    expect(session.toProps()).toMatchObject({
      status: 'ACTIVE',
      startedAt: at(2),
      targetEnergyWh: 60_000,
    });
  });

  it('keeps waiting after a declined card so the driver can retry', () => {
    const session = commercialSession();

    session.recordPaymentFailed('card_declined');
    expect(session.toProps()).toMatchObject({
      status: 'AWAITING_PAYMENT',
      payment: { status: 'FAILED', failureCode: 'card_declined' },
    });

    expect(session.recordPaymentAuthorized(20_040, at(3))).toBe(true);
    expect(session.payment).toMatchObject({
      status: 'AUTHORIZED',
      failureCode: null,
    });
  });

  it('interrupts the session when the hold is canceled before charging', () => {
    const session = commercialSession();

    session.recordPaymentCanceled(at(4));

    expect(session.toProps()).toMatchObject({
      status: 'INTERRUPTED',
      endedAt: at(4),
      payment: { status: 'CANCELED', canceledAt: at(4) },
    });
    expect(session.paymentSettlement).toBeNull();
  });

  it('releases the hold when the driver cancels before charging', () => {
    const session = commercialSession();

    session.stop(at(1));

    expect(session.status).toBe('INTERRUPTED');
    expect(session.paymentSettlement).toEqual({ action: 'CANCEL' });
  });

  it('captures the final amount when the session closes', () => {
    const session = chargingSession();
    session.recordTelemetry(
      { at: at(12), energyWh: 3667, powerKw: 22, socPercent: 15 },
      null,
      at(12),
    );

    expect(session.paymentSettlement).toBeNull();
    session.stop(at(12));

    expect(session.paymentSettlement).toEqual({
      action: 'CAPTURE',
      amountCents: 1041,
    });
    session.recordPaymentCaptured(1041, at(13));
    expect(session.payment).toMatchObject({
      status: 'CAPTURED',
      capturedCents: 1041,
      capturedAt: at(13),
    });
    expect(session.paymentSettlement).toBeNull();
  });

  it('refunds the captured amount of auto refund payments', () => {
    const session = chargingSession(true);
    session.recordTelemetry(
      { at: at(12), energyWh: 3667, powerKw: 22, socPercent: 15 },
      null,
      at(12),
    );
    session.stop(at(12));
    session.recordPaymentCaptured(1041, at(13));

    expect(session.paymentSettlement).toEqual({
      action: 'REFUND',
      amountCents: 1041,
    });
    session.recordPaymentRefunded(1041, at(14));
    expect(session.payment).toMatchObject({
      mode: 'LIVE',
      status: 'REFUNDED',
      capturedCents: 1041,
      refundedCents: 1041,
      refundedAt: at(14),
    });
    expect(session.paymentSettlement).toBeNull();

    session.recordPaymentCaptured(1041, at(15));
    session.recordPaymentCanceled(at(15));
    expect(session.payment?.status).toBe('REFUNDED');
  });

  it('only refunds captured payments', () => {
    const session = commercialSession(true);

    session.recordPaymentRefunded(1041, at(1));

    expect(session.payment).toMatchObject({
      status: 'PENDING_AUTHORIZATION',
      refundedCents: null,
    });
  });

  it('flags holds that were not authorized in time', () => {
    const session = commercialSession();

    expect(session.isPaymentOverdue(at(14), 15)).toBe(false);
    expect(session.isPaymentOverdue(at(15), 15)).toBe(true);
    session.recordPaymentAuthorized(20_040, at(15));
    expect(session.isPaymentOverdue(at(30), 15)).toBe(false);
  });

  it('refuses payment updates on sessions without a payment', () => {
    const session = ChargingSession.restore({
      ...commercialSession().toProps(),
      payment: null,
    });

    expect(() => session.recordPaymentCanceled(at(1))).toThrow(
      InvalidSessionTransitionError,
    );
  });
});
