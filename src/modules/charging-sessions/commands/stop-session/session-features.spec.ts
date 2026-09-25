import { ChargingSession } from '../../domain/charging-session.entity.js';
import { sessionFeatures } from './session-features.js';

const STARTED_AT = new Date('2026-10-07T22:00:00.000-03:00');

function at(minutes: number): Date {
  return new Date(STARTED_AT.getTime() + minutes * 60_000);
}

describe('sessionFeatures', () => {
  it('describes a closed session for the anomaly model', () => {
    const session = ChargingSession.create({
      id: 'session-1',
      userId: 'user-1',
      chargePointId: 'point-1',
      chargePointCode: 'L1-01',
      chargePointName: 'Garagem L1 · Vaga 12',
      chargerSerialNumber: 'GW-1',
      organizationId: 'organization-1',
      unitLabel: 'B · 42',
      regime: 'PRIVATE',
      limit: { type: 'FULL' },
      allocatedPowerKw: 7,
      timeScale: 1,
      lockedRateCents: 89,
      demandFactor: 1,
      demandFactorSource: 'RULE',
      demandModelVersion: null,
      idleFeeCentsPerMinute: 25,
      idleFeeCapCents: 3000,
      gracePeriodMinutes: 10,
      startedAt: STARTED_AT,
    });
    session.activate(
      'tx-1',
      { batteryCapacityWh: 50_000, socPercent: 42 },
      STARTED_AT,
    );
    session.recordTelemetry(
      { at: at(120), energyWh: 12_000, powerKw: 0, socPercent: 66 },
      at(120),
      at(120),
    );
    session.stop(at(142));

    expect(sessionFeatures(session.toProps())).toEqual({
      chargePointType: 'PRIVATE',
      startHour: 22,
      dayOfWeek: 2,
      energyKwh: 12,
      durationMinutes: 142,
      idleMinutes: 22,
      averagePowerKw: 5.07,
    });
  });
});
