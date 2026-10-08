import type { Clock } from '../../common/clock/clock.js';
import type { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import { ChargingSession } from './domain/charging-session.entity.js';
import { OrganizationLiveSessions } from './organization-live-sessions.js';
import type { SessionSynchronizer } from './session-synchronizer.js';

const STARTED_AT = new Date('2026-10-07T22:00:00.000Z');
const NOW = new Date('2026-10-07T23:00:00.000Z');

function activeSession(id: string, chargePointId: string): ChargingSession {
  const session = ChargingSession.create({
    id,
    userId: 'user-1',
    chargePointId,
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
    `tx-${id}`,
    { batteryCapacityWh: 50_000, socPercent: 42 },
    STARTED_AT,
  );
  return session;
}

describe('OrganizationLiveSessions', () => {
  it('advances the open sessions of the organization and reports their live state', async () => {
    const charging = activeSession('charging', 'point-1');
    const waiting = activeSession('waiting', 'point-2');
    const finished = activeSession('finished', 'point-3');
    const sync = vi.fn((session: ChargingSession, now: Date) => {
      if (session.id === 'charging') {
        session.recordTelemetry(
          { at: now, energyWh: 6000, powerKw: 6.4, socPercent: 54 },
          null,
          now,
        );
      }
      if (session.id === 'waiting') {
        session.recordTelemetry(
          { at: now, energyWh: 29_000, powerKw: 0, socPercent: 100 },
          new Date('2026-10-07T22:55:00.000Z'),
          now,
        );
      }
      if (session.id === 'finished') {
        session.stop(now);
      }
      return Promise.resolve(session);
    });
    const live = new OrganizationLiveSessions(
      {
        findOpenByOrganization: () =>
          Promise.resolve([charging, waiting, finished]),
      } as unknown as ChargingSessionRepository,
      { sync } as unknown as SessionSynchronizer,
      { now: () => NOW } as Clock,
    );

    await expect(live.refresh('organization-1')).resolves.toEqual([
      {
        sessionId: 'charging',
        chargePointId: 'point-1',
        status: 'ACTIVE',
        powerKw: 6.4,
        graceEndsAt: null,
      },
      {
        sessionId: 'waiting',
        chargePointId: 'point-2',
        status: 'GRACE',
        powerKw: 0,
        graceEndsAt: new Date('2026-10-07T23:05:00.000Z'),
      },
    ]);
    expect(sync).toHaveBeenCalledTimes(3);
    expect(sync).toHaveBeenCalledWith(charging, NOW);
  });
});
