import type { ChargingLimit } from './charging-limit.js';
import {
  ChargingSession,
  InvalidSessionTransitionError,
  SessionAlreadyEndedError,
} from './charging-session.entity.js';

const STARTED_AT = new Date('2026-10-07T22:00:00.000Z');
const VEHICLE = { batteryCapacityWh: 50_000, socPercent: 42 };

function at(minutes: number): Date {
  return new Date(STARTED_AT.getTime() + minutes * 60_000);
}

function newSession(
  limit: ChargingLimit = { type: 'FULL' },
  timeScale = 1,
): ChargingSession {
  return ChargingSession.create({
    id: 'session-1',
    userId: 'user-1',
    chargePointId: 'point-1',
    chargePointCode: 'L1-01',
    chargePointName: 'Garagem L1 · Vaga 12',
    chargerSerialNumber: 'GW-1',
    organizationId: 'organization-1',
    unitLabel: 'B · 42',
    regime: 'PRIVATE',
    limit,
    allocatedPowerKw: 7,
    timeScale,
    lockedRateCents: 89,
    demandFactor: 1,
    demandFactorSource: 'RULE',
    demandModelVersion: null,
    idleFeeCentsPerMinute: 25,
    idleFeeCapCents: 3000,
    gracePeriodMinutes: 10,
    startedAt: STARTED_AT,
  });
}

function activeSession(limit?: ChargingLimit): ChargingSession {
  const session = newSession(limit);
  session.activate('tx-1', VEHICLE, STARTED_AT);
  return session;
}

function finishedCharging(minutes = 240): ChargingSession {
  const session = activeSession();
  session.recordTelemetry(
    { at: at(minutes), energyWh: 29_000, powerKw: 0, socPercent: 100 },
    at(minutes),
    at(minutes),
  );
  return session;
}

describe('ChargingSession', () => {
  it('starts pending with nothing charged', () => {
    const session = newSession();

    expect(session.toProps()).toMatchObject({
      status: 'PENDING',
      energyWh: 0,
      totalCents: 0,
      targetEnergyWh: null,
    });
  });

  it('activates with the vehicle and the target energy of the limit', () => {
    const session = activeSession({ type: 'ENERGY', energyWh: 12_000 });

    expect(session.toProps()).toMatchObject({
      status: 'ACTIVE',
      externalTransactionId: 'tx-1',
      batteryCapacityWh: 50_000,
      initialSocPercent: 42,
      socPercent: 42,
      targetEnergyWh: 12_000,
      powerKw: 7,
    });
  });

  it('only activates pending sessions', () => {
    const session = activeSession();

    expect(() => session.activate('tx-2', VEHICLE, STARTED_AT)).toThrow(
      InvalidSessionTransitionError,
    );
  });

  it('accumulates energy cost while charging', () => {
    const session = activeSession();
    session.recordTelemetry(
      { at: at(60), energyWh: 7000, powerKw: 7, socPercent: 56 },
      null,
      at(60),
    );

    expect(session.toProps()).toMatchObject({
      status: 'ACTIVE',
      energyWh: 7000,
      energyCostCents: 623,
      totalCents: 623,
      telemetryReadAt: at(60),
    });
  });

  it('enters the grace period when the battery is full', () => {
    const session = finishedCharging();

    expect(session.status).toBe('GRACE');
    expect(session.toProps()).toMatchObject({
      chargingEndedAt: at(240),
      powerKw: 0,
      energyCostCents: 2581,
    });
    expect(session.graceEndsAt).toEqual(at(250));
  });

  it('tells when the idle fee starts and when it reaches the cap', () => {
    expect(activeSession().idleStartsAt).toBeNull();
    expect(activeSession().idleFeeCapReachedAt).toBeNull();

    const session = finishedCharging();

    expect(session.idleStartsAt).toEqual(at(250));
    expect(session.idleFeeCapReachedAt).toEqual(at(250 + 120));
  });

  it('stays in grace without fees until the grace period ends', () => {
    const session = finishedCharging();
    session.advance(at(249));

    expect(session.status).toBe('GRACE');
    expect(session.toProps()).toMatchObject({
      idleMinutes: 0,
      idleFeeCents: 0,
    });
  });

  it('becomes idle and accrues the idle fee per minute after the grace period', () => {
    const session = finishedCharging();
    session.advance(at(250));
    expect(session.status).toBe('IDLE');
    expect(session.toProps().idleFeeCents).toBe(0);

    session.advance(at(256.5));
    expect(session.toProps()).toMatchObject({
      idleMinutes: 6,
      idleFeeCents: 150,
      totalCents: 2731,
    });
  });

  it('caps the idle fee', () => {
    const session = finishedCharging();
    session.advance(at(250 + 600));

    expect(session.toProps()).toMatchObject({
      idleMinutes: 600,
      idleFeeCents: 3000,
      totalCents: 5581,
    });
  });

  it('goes straight from charging to idle when read late', () => {
    const session = activeSession();
    session.recordTelemetry(
      { at: at(300), energyWh: 29_000, powerKw: 0, socPercent: 100 },
      at(240),
      at(300),
    );
    session.advance(at(300));

    expect(session.status).toBe('IDLE');
    expect(session.toProps().idleMinutes).toBe(50);
  });

  it('counts grace and idle time in simulated minutes', () => {
    const session = newSession({ type: 'FULL' }, 60);
    session.activate('tx-1', VEHICLE, STARTED_AT);
    const completedAt = new Date(STARTED_AT.getTime() + 240_000);
    session.recordTelemetry(
      { at: completedAt, energyWh: 29_000, powerKw: 0, socPercent: 100 },
      completedAt,
      completedAt,
    );

    expect(session.graceEndsAt).toEqual(
      new Date(completedAt.getTime() + 10_000),
    );
    session.advance(new Date(completedAt.getTime() + 16_000));
    expect(session.toProps()).toMatchObject({
      status: 'IDLE',
      idleMinutes: 6,
      idleFeeCents: 150,
    });
  });

  it('closes with partial energy when the driver stops while charging', () => {
    const session = activeSession();
    session.recordTelemetry(
      { at: at(35), energyWh: 4083, powerKw: 7, socPercent: 50 },
      null,
      at(35),
    );
    session.stop(at(35));

    expect(session.toProps()).toMatchObject({
      status: 'CLOSED',
      chargingEndedAt: at(35),
      endedAt: at(35),
      powerKw: 0,
      energyWh: 4083,
      energyCostCents: 363,
      idleFeeCents: 0,
      totalCents: 363,
    });
  });

  it('closes without idle fee when unplugged during the grace period', () => {
    const session = finishedCharging();
    session.stop(at(245));

    expect(session.toProps()).toMatchObject({
      status: 'CLOSED',
      endedAt: at(245),
      chargingEndedAt: at(240),
      idleFeeCents: 0,
      totalCents: 2581,
    });
  });

  it('freezes the idle fee when unplugged', () => {
    const session = finishedCharging();
    session.stop(at(262));

    expect(session.toProps()).toMatchObject({
      status: 'CLOSED',
      idleMinutes: 12,
      idleFeeCents: 300,
      totalCents: 2881,
    });
    session.advance(at(400));
    expect(session.toProps().idleFeeCents).toBe(300);
  });

  it('refuses to stop an ended session', () => {
    const session = finishedCharging();
    session.stop(at(245));

    expect(() => session.stop(at(246))).toThrow(SessionAlreadyEndedError);
  });

  it('interrupts a pending session that never started', () => {
    const session = newSession();
    session.stop(at(1));

    expect(session.toProps()).toMatchObject({
      status: 'INTERRUPTED',
      endedAt: at(1),
      totalCents: 0,
    });
  });

  it('records the anomaly score of a closed session', () => {
    const session = finishedCharging();
    session.stop(at(245));
    session.recordAnomaly({
      score: 0.9132,
      isAnomaly: true,
      modelVersion: 'iforest-1',
    });

    expect(session.toProps()).toMatchObject({
      anomalyScore: 0.9132,
      isAnomaly: true,
      anomalyModelVersion: 'iforest-1',
    });
  });

  it('only scores closed sessions', () => {
    expect(() =>
      activeSession().recordAnomaly({
        score: 0.1,
        isAnomaly: false,
        modelVersion: null,
      }),
    ).toThrow(InvalidSessionTransitionError);
  });

  it('ignores telemetry once charging has ended', () => {
    const session = finishedCharging();
    session.recordTelemetry(
      { at: at(300), energyWh: 30_000, powerKw: 7, socPercent: 100 },
      null,
      at(300),
    );

    expect(session.toProps().energyWh).toBe(29_000);
  });
});
