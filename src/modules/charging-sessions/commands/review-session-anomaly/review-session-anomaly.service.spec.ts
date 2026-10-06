import { HttpException } from '@nestjs/common';
import type { Clock } from '../../../../common/clock/clock.js';
import type { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import { ChargingSession } from '../../domain/charging-session.entity.js';
import type { SessionProjector } from '../../session-projector.js';
import { ReviewSessionAnomalyService } from './review-session-anomaly.service.js';

const NOW = new Date('2026-10-07T22:30:00.000Z');
const ORGANIZATION_ID = 'organization-1';
const DRIVER = { id: 'user-1', name: 'Ana Ribeiro' };
const TIMELINE = {
  chargingEndsAt: null,
  graceEndsAt: null,
  idleStartsAt: null,
  idleFeeCapReachedAt: null,
};

function closedSession(isAnomaly: boolean | null): ChargingSession {
  const session = ChargingSession.create({
    id: 'session-1',
    userId: DRIVER.id,
    chargePointId: 'point-1',
    chargePointCode: 'L1-01',
    chargePointName: 'Garagem L1 · Vaga 12',
    chargerSerialNumber: 'GW-1',
    organizationId: ORGANIZATION_ID,
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
    startedAt: new Date('2026-10-07T20:00:00.000Z'),
  });
  session.activate(
    'tx-1',
    { batteryCapacityWh: 50_000, socPercent: 42 },
    new Date('2026-10-07T20:00:00.000Z'),
  );
  session.stop(new Date('2026-10-07T21:00:00.000Z'));
  if (isAnomaly !== null) {
    session.recordAnomaly({ score: 0.9, isAnomaly, modelVersion: 'v1' });
  }
  return session;
}

function errorCode(error: unknown): unknown {
  return error instanceof HttpException
    ? (error.getResponse() as { code: string }).code
    : error;
}

const command = {
  organizationId: ORGANIZATION_ID,
  sessionId: 'session-1',
  reviewerId: 'manager-1',
  decision: 'DISMISSED' as const,
  note: 'Carga de visitante',
};

describe('ReviewSessionAnomalyService', () => {
  let findById: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;
  let service: ReviewSessionAnomalyService;

  beforeEach(() => {
    findById = vi.fn(() => Promise.resolve(closedSession(true)));
    save = vi.fn().mockResolvedValue(true);
    service = new ReviewSessionAnomalyService(
      {
        findById,
        save,
        findDriver: () => Promise.resolve(DRIVER),
        findReadings: () => Promise.resolve([]),
      } as unknown as ChargingSessionRepository,
      { now: () => NOW } as Clock,
      { timelineOf: () => TIMELINE } as unknown as SessionProjector,
    );
  });

  it('saves the review and answers with the organization detail', async () => {
    const detail = await service.execute(command);

    expect(save).toHaveBeenCalledOnce();
    expect(detail).toMatchObject({
      id: 'session-1',
      driver: DRIVER,
      isAnomaly: true,
      anomalyReviewStatus: 'DISMISSED',
      anomalyReviewNote: 'Carga de visitante',
      anomalyReviewedAt: NOW,
      anomalyReviewedById: 'manager-1',
    });
  });

  it('reloads and reviews again when the session changed meanwhile', async () => {
    save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await service.execute(command);

    expect(findById).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('refuses sessions that are not flagged', async () => {
    findById.mockImplementation(() => Promise.resolve(closedSession(false)));

    const error: unknown = await service
      .execute(command)
      .catch((caught: unknown) => caught);

    expect(errorCode(error)).toBe('SESSION_NOT_FLAGGED');
    expect(save).not.toHaveBeenCalled();
  });

  it('hides sessions of another organization', async () => {
    const error: unknown = await service
      .execute({ ...command, organizationId: 'organization-2' })
      .catch((caught: unknown) => caught);

    expect(errorCode(error)).toBe('SESSION_NOT_FOUND');
  });
});
