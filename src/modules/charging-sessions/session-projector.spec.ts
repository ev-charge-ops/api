import type {
  ChargerGateway,
  ChargingProfile,
} from '../charger-gateway/charger-gateway.port.js';
import { ChargingSession } from './domain/charging-session.entity.js';
import { chargingProfileOf, SessionProjector } from './session-projector.js';

const STARTED_AT = new Date('2026-10-07T22:00:00.000Z');
const VEHICLE = { batteryCapacityWh: 50_000, socPercent: 42 };

function at(minutes: number): Date {
  return new Date(STARTED_AT.getTime() + minutes * 60_000);
}

function newSession(): ChargingSession {
  return ChargingSession.create({
    id: 'session-1',
    userId: 'user-1',
    chargePointId: 'point-1',
    chargePointCode: 'L1-01',
    chargePointName: 'Vaga L1-01',
    chargerSerialNumber: 'GW-1',
    organizationId: 'organization-1',
    unitLabel: null,
    regime: 'PRIVATE',
    limit: { type: 'ENERGY', energyWh: 3500 },
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
}

function activeSession(): ChargingSession {
  const session = newSession();
  session.activate('tx-1', VEHICLE, STARTED_AT);
  return session;
}

function projectorReturning(completion: Date | null) {
  const projectCompletion = vi.fn(
    (_profile: ChargingProfile): Date | null => completion,
  );
  const projector = new SessionProjector({
    projectCompletion,
  } as unknown as ChargerGateway);
  return { projector, projectCompletion };
}

describe('chargingProfileOf', () => {
  it('describes the charging of an active session', () => {
    expect(chargingProfileOf(activeSession())).toEqual({
      chargerSerialNumber: 'GW-1',
      transactionId: 'tx-1',
      startedAt: STARTED_AT,
      allocatedPowerKw: 7,
      targetEnergyWh: 3500,
      batteryCapacityWh: 50_000,
      initialSocPercent: 42,
      timeScale: 1,
    });
  });
});

describe('SessionProjector', () => {
  it('projects the timeline of an active session from the charger', () => {
    const { projector, projectCompletion } = projectorReturning(at(30));

    expect(projector.timelineOf(activeSession())).toEqual({
      chargingEndsAt: at(30),
      graceEndsAt: at(40),
      idleStartsAt: at(40),
      idleFeeCapReachedAt: at(160),
    });
    expect(projectCompletion).toHaveBeenCalledWith(
      chargingProfileOf(activeSession()),
    );
  });

  it('does not ask the charger before it starts', () => {
    const { projector, projectCompletion } = projectorReturning(at(30));

    expect(projector.timelineOf(newSession()).chargingEndsAt).toBeNull();
    expect(projectCompletion).not.toHaveBeenCalled();
  });

  it('projects nothing when the charger cannot predict the end', () => {
    const { projector } = projectorReturning(null);

    expect(projector.timelineOf(activeSession()).graceEndsAt).toBeNull();
    expect(projector.isProjectable(activeSession())).toBe(false);
  });

  it('tells whether the charger can predict the end', () => {
    expect(
      projectorReturning(at(30)).projector.isProjectable(activeSession()),
    ).toBe(true);
  });
});
