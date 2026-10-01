import { HttpException } from '@nestjs/common';
import type { Clock } from '../../../../common/clock/clock.js';
import type { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import { ChargingSession } from '../../domain/charging-session.entity.js';
import type { SessionProjector } from '../../session-projector.js';
import type { SessionSynchronizer } from '../../session-synchronizer.js';
import { GetOrganizationSessionService } from './get-organization-session.service.js';

const NOW = new Date('2026-10-07T22:30:00.000Z');
const STARTED_AT = new Date('2026-10-07T22:00:00.000Z');
const ORGANIZATION_ID = 'organization-1';
const DRIVER = { id: 'user-1', name: 'Ana Ribeiro' };
const TIMELINE = {
  chargingEndsAt: null,
  graceEndsAt: null,
  idleStartsAt: null,
  idleFeeCapReachedAt: null,
};

function newSession(organizationId = ORGANIZATION_ID): ChargingSession {
  return ChargingSession.create({
    id: 'session-1',
    userId: DRIVER.id,
    chargePointId: 'point-1',
    chargePointCode: 'L1-01',
    chargePointName: 'Garagem L1 · Vaga 12',
    chargerSerialNumber: 'GW-1',
    organizationId,
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
}

function notFoundCode(error: unknown): unknown {
  return error instanceof HttpException
    ? (error.getResponse() as { code: string }).code
    : error;
}

describe('GetOrganizationSessionService', () => {
  let found: ChargingSession | null;
  let sync: ReturnType<typeof vi.fn>;
  let findDriver: ReturnType<typeof vi.fn>;
  let service: GetOrganizationSessionService;

  beforeEach(() => {
    found = newSession();
    sync = vi.fn((session: ChargingSession) => Promise.resolve(session));
    findDriver = vi.fn().mockResolvedValue(DRIVER);
    service = new GetOrganizationSessionService(
      {
        findById: () => Promise.resolve(found),
        findDriver,
        findReadings: () =>
          Promise.resolve([
            { at: NOW, energyWh: 3500, powerKw: 7, socPercent: 50 },
          ]),
      } as unknown as ChargingSessionRepository,
      { sync } as unknown as SessionSynchronizer,
      { now: () => NOW } as Clock,
      { timelineOf: () => TIMELINE } as unknown as SessionProjector,
    );
  });

  it('returns the synchronized session of the organization with its driver', async () => {
    const detail = await service.execute(ORGANIZATION_ID, 'session-1');

    expect(sync).toHaveBeenCalledWith(found, NOW);
    expect(findDriver).toHaveBeenCalledWith(DRIVER.id);
    expect(detail).toMatchObject({
      id: 'session-1',
      organizationId: ORGANIZATION_ID,
      unitLabel: 'B · 42',
      status: 'PENDING',
      driver: DRIVER,
      anomalyModelVersion: null,
      chargePoint: { id: 'point-1', code: 'L1-01' },
      readings: [{ energyKwh: 3.5, powerKw: 7, socPercent: 50 }],
    });
  });

  it('hides sessions of another organization', async () => {
    found = newSession('organization-2');

    const error: unknown = await service
      .execute(ORGANIZATION_ID, 'session-1')
      .catch((caught: unknown) => caught);

    expect(notFoundCode(error)).toBe('SESSION_NOT_FOUND');
    expect(sync).not.toHaveBeenCalled();
  });

  it('reports unknown sessions as not found', async () => {
    found = null;

    const error: unknown = await service
      .execute(ORGANIZATION_ID, 'session-1')
      .catch((caught: unknown) => caught);

    expect(notFoundCode(error)).toBe('SESSION_NOT_FOUND');
  });
});
