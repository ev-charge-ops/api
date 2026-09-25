import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  type AnomalyScore,
  AnomalyScorer,
  DisabledAnomalyScorer,
  type SessionFeatures,
} from '../src/modules/intelligence/anomaly/anomaly-scorer.port.js';
import {
  type AnomalyInput,
  buildDemoAnomalies,
  FallbackAnomalyScorer,
  insertDemoAnomalies,
  type OccupiedInterval,
  RuleAnomalyScorer,
  ruleAnomalyScore,
} from './demo-anomalies.js';
import { buildDemoHistory, buildDemoResidents } from './demo-history.js';

const NOW = new Date('2026-10-07T12:00:00.000-03:00');

const POINTS: AnomalyInput['points'] = [
  { id: 'p1', code: 'L1-01', type: 'PRIVATE', maxPowerKw: 7, rateCents: 89 },
  { id: 'p2', code: 'L1-02', type: 'PRIVATE', maxPowerKw: 7, rateCents: 89 },
  {
    id: 'p3',
    code: 'L2-01',
    type: 'COMMERCIAL',
    maxPowerKw: 22,
    rateCents: 189,
  },
];

const DRIVERS = [
  ...buildDemoResidents().map(({ unitLabel }, index) => ({
    userId: `user-${index}`,
    unitLabel,
  })),
  { userId: 'demo-driver', unitLabel: 'B · 42' },
];

function historyIntervals(now: Date): OccupiedInterval[] {
  return buildDemoHistory({
    organizationId: 'organization-1',
    now,
    points: POINTS,
    drivers: DRIVERS,
  }).map((session) => ({
    chargePointId: session.chargePointId,
    start: session.startedAt as Date,
    end: session.endedAt as Date,
  }));
}

function input(now = NOW): AnomalyInput {
  return {
    organizationId: 'organization-1',
    now,
    points: POINTS,
    drivers: DRIVERS,
    occupied: historyIntervals(now),
  };
}

const NORMAL_PRIVATE: SessionFeatures = {
  chargePointType: 'PRIVATE',
  startHour: 22,
  dayOfWeek: 1,
  energyKwh: 14,
  durationMinutes: 900,
  idleMinutes: 770,
  averagePowerKw: 0.93,
};

class FixedScorer extends AnomalyScorer {
  readonly calls: SessionFeatures[] = [];

  constructor(private readonly result: AnomalyScore | null) {
    super();
  }

  score(features: SessionFeatures): Promise<AnomalyScore | null> {
    this.calls.push(features);
    return Promise.resolve(this.result);
  }
}

describe('buildDemoAnomalies', () => {
  const anomalies = buildDemoAnomalies(input());

  it('is deterministic', () => {
    expect(buildDemoAnomalies(input())).toEqual(anomalies);
  });

  it('spreads a handful of anomalies over the current and the previous month', () => {
    expect(anomalies.length).toBeGreaterThanOrEqual(5);
    expect(anomalies.length).toBeLessThanOrEqual(8);
    const months = new Set(
      anomalies.map((anomaly) =>
        anomaly.timeline.startedAt.toISOString().slice(0, 7),
      ),
    );
    expect([...months].sort()).toEqual(['2026-09', '2026-10']);
    expect(new Set(anomalies.map((anomaly) => anomaly.kind))).toEqual(
      new Set([
        'METER_SPIKE',
        'ENERGY_BURST',
        'MULTI_DAY_OCCUPATION',
        'EXTREME_IDLE',
      ]),
    );
    expect(
      anomalies.every((anomaly) => (anomaly.timeline.endedAt as Date) < NOW),
    ).toBe(true);
    expect(new Set(anomalies.map((anomaly) => anomaly.id)).size).toBe(
      anomalies.length,
    );
  });

  it('fits the anomalies between the existing sessions of each point', () => {
    const intervals = [
      ...historyIntervals(NOW),
      ...anomalies.map((anomaly) => ({
        chargePointId: anomaly.session.chargePointId,
        start: anomaly.timeline.startedAt,
        end: anomaly.timeline.endedAt as Date,
      })),
    ];
    for (const anomaly of anomalies) {
      const clashes = intervals.filter(
        (interval) =>
          interval.chargePointId === anomaly.session.chargePointId &&
          interval.start < (anomaly.timeline.endedAt as Date) &&
          interval.end > anomaly.timeline.startedAt,
      );
      expect(clashes).toHaveLength(1);
    }
  });

  it('plans the same anomalies on a database that already has them', () => {
    const seeded = input();
    seeded.occupied.push(
      ...anomalies.map((anomaly) => ({
        sessionId: anomaly.id,
        chargePointId: anomaly.session.chargePointId,
        start: anomaly.timeline.startedAt,
        end: anomaly.timeline.endedAt as Date,
      })),
    );

    expect(buildDemoAnomalies(seeded)).toEqual(anomalies);
  });

  it('keeps the same ids when the seed runs again later', () => {
    const later = buildDemoAnomalies(
      input(new Date('2026-10-20T12:00:00-03:00')),
    );
    const laterIds = new Set(later.map((anomaly) => anomaly.id));

    expect(anomalies.every((anomaly) => laterIds.has(anomaly.id))).toBe(true);
  });

  it('describes realistic anomalous sessions with consistent billing', () => {
    const spike = anomalies.find((anomaly) => anomaly.kind === 'METER_SPIKE');
    const occupation = anomalies.find(
      (anomaly) => anomaly.kind === 'MULTI_DAY_OCCUPATION',
    );
    if (!spike || !occupation) {
      throw new Error('expected a meter spike and a multi-day occupation');
    }

    expect(spike.session).toMatchObject({
      regime: 'PRIVATE',
      status: 'CLOSED',
      energyKwh: '41.000',
      lockedRateCents: 89,
      unitLabel: expect.stringMatching(/^[AB] · \d{2}$/),
    });
    expect(occupation.session).toMatchObject({
      regime: 'COMMERCIAL',
      unitLabel: null,
      idleFeeCents: 3000,
    });
    const hours =
      ((occupation.timeline.endedAt as Date).getTime() -
        occupation.timeline.startedAt.getTime()) /
      3_600_000;
    expect(hours).toBeGreaterThan(48);
    for (const { session } of anomalies) {
      expect(session.totalCents).toBe(
        (session.energyCostCents ?? 0) + (session.idleFeeCents ?? 0),
      );
    }
  });

  it('skips the anomalies that would still be running', () => {
    expect(
      buildDemoAnomalies(input(new Date('2026-10-01T12:00:00-03:00'))).every(
        (anomaly) => anomaly.timeline.startedAt.getUTCMonth() === 8,
      ),
    ).toBe(true);
  });
});

describe('ruleAnomalyScore', () => {
  it('flags every generated anomaly', () => {
    for (const anomaly of buildDemoAnomalies(input())) {
      const features: SessionFeatures = {
        chargePointType: anomaly.timeline.regime,
        startHour: 12,
        dayOfWeek: 2,
        energyKwh: anomaly.timeline.energyWh / 1000,
        durationMinutes:
          ((anomaly.timeline.endedAt as Date).getTime() -
            anomaly.timeline.startedAt.getTime()) /
          60_000,
        idleMinutes:
          ((anomaly.timeline.endedAt as Date).getTime() -
            (anomaly.timeline.chargingEndedAt as Date).getTime()) /
          60_000,
        averagePowerKw: 1,
      };
      expect(ruleAnomalyScore(features).isAnomaly).toBe(true);
    }
  });

  it('keeps an ordinary overnight charge below the threshold', () => {
    expect(ruleAnomalyScore(NORMAL_PRIVATE)).toEqual({
      score: 0.1337,
      isAnomaly: false,
      modelVersion: null,
    });
  });
});

describe('FallbackAnomalyScorer', () => {
  it('uses the model score when available', async () => {
    const model = { score: 0.61, isAnomaly: true, modelVersion: 'v1' };
    const scorer = new FallbackAnomalyScorer(
      new FixedScorer(model),
      new RuleAnomalyScorer(),
    );

    await expect(scorer.score(NORMAL_PRIVATE)).resolves.toEqual(model);
  });

  it('falls back to the rules when the model has no answer', async () => {
    const scorer = new FallbackAnomalyScorer(
      new DisabledAnomalyScorer(),
      new RuleAnomalyScorer(),
    );

    await expect(scorer.score(NORMAL_PRIVATE)).resolves.toMatchObject({
      isAnomaly: false,
      modelVersion: null,
    });
  });
});

describe('insertDemoAnomalies', () => {
  function fakePrisma(existingIds: string[]) {
    const createMany = vi.fn(({ data }: { data: unknown[] }) =>
      Promise.resolve({ count: data.length }),
    );
    const prisma = {
      chargingSession: {
        findMany: vi.fn(() =>
          Promise.resolve(existingIds.map((id) => ({ id }))),
        ),
        createMany,
      },
    } as unknown as Pick<PrismaClient, 'chargingSession'>;
    return { prisma, createMany };
  }

  const anomalies = buildDemoAnomalies(input());

  it('scores and inserts only the anomalies not seeded yet', async () => {
    const { prisma, createMany } = fakePrisma([anomalies[0].id]);
    const scorer = new FixedScorer({
      score: 0.6578,
      isAnomaly: true,
      modelVersion: 'v1',
    });

    await expect(insertDemoAnomalies(prisma, anomalies, scorer)).resolves.toBe(
      anomalies.length - 1,
    );
    expect(scorer.calls).toHaveLength(anomalies.length - 1);
    const [{ data, skipDuplicates }] = createMany.mock.calls[0] as unknown as [
      { data: { id: string }[]; skipDuplicates: boolean },
    ];
    expect(skipDuplicates).toBe(true);
    expect(data.map((row) => row.id)).not.toContain(anomalies[0].id);
    expect(data[0]).toMatchObject({
      anomalyScore: 0.6578,
      isAnomaly: true,
      anomalyModelVersion: 'v1',
    });
  });

  it('does nothing on a database that already has them', async () => {
    const { prisma, createMany } = fakePrisma(
      anomalies.map((anomaly) => anomaly.id),
    );
    const scorer = new FixedScorer(null);

    await expect(insertDemoAnomalies(prisma, anomalies, scorer)).resolves.toBe(
      0,
    );
    expect(scorer.calls).toHaveLength(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});
