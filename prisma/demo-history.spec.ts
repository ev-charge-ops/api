import {
  buildDemoHistory,
  buildDemoResidents,
  deterministicId,
  type HistoryInput,
} from './demo-history.js';

const NOW = new Date('2026-10-07T12:00:00.000-03:00');

function input(now = NOW): HistoryInput {
  return {
    organizationId: 'organization-1',
    now,
    points: [
      {
        id: 'p1',
        code: 'L1-01',
        type: 'PRIVATE',
        maxPowerKw: 7,
        rateCents: 89,
      },
      {
        id: 'p2',
        code: 'L1-02',
        type: 'PRIVATE',
        maxPowerKw: 7,
        rateCents: 89,
      },
      {
        id: 'p3',
        code: 'L2-01',
        type: 'COMMERCIAL',
        maxPowerKw: 22,
        rateCents: 189,
      },
    ],
    drivers: [
      ...buildDemoResidents().map(({ unitLabel }, index) => ({
        userId: `user-${index}`,
        unitLabel,
      })),
      { userId: 'demo-driver', unitLabel: 'B · 42' },
    ],
  };
}

describe('buildDemoResidents', () => {
  it('creates twenty residents in distinct units without passwords', () => {
    const residents = buildDemoResidents();

    expect(residents).toHaveLength(20);
    expect(new Set(residents.map((resident) => resident.unitLabel)).size).toBe(
      20,
    );
    expect(residents[0]).toEqual({
      name: 'Ana Ribeiro',
      email: 'ana.ribeiro@example.com',
      unitLabel: 'A · 11',
    });
    expect(residents[19].unitLabel).toBe('B · 32');
    expect(residents.map((resident) => resident.unitLabel)).not.toContain(
      'B · 42',
    );
  });
});

describe('deterministicId', () => {
  it('derives a stable UUID from a key', () => {
    const id = deterministicId('demo-session:L1-01:2026-8-1:evening');

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(deterministicId('demo-session:L1-01:2026-8-1:evening')).toBe(id);
    expect(deterministicId('demo-session:L1-01:2026-8-2:evening')).not.toBe(id);
  });
});

describe('buildDemoHistory', () => {
  const sessions = buildDemoHistory(input());

  it('is deterministic', () => {
    expect(buildDemoHistory(input())).toEqual(sessions);
  });

  it('covers the two previous months and the current one up to now', () => {
    const months = new Set(
      sessions.map((session) =>
        new Date(session.startedAt as Date).toISOString().slice(0, 7),
      ),
    );
    expect([...months].sort()).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(sessions.every((session) => (session.endedAt as Date) < NOW)).toBe(
      true,
    );
    expect(sessions.length).toBeGreaterThan(150);
  });

  it('keeps the sessions of a later run for the same days', () => {
    const later = buildDemoHistory(
      input(new Date('2026-10-20T12:00:00-03:00')),
    );
    const laterIds = new Set(later.map((session) => session.id));

    expect(sessions.every((session) => laterIds.has(session.id))).toBe(true);
  });

  it('never overlaps two sessions on the same point', () => {
    const pointIds = new Set(sessions.map((session) => session.chargePointId));
    for (const pointId of pointIds) {
      const sorted = sessions
        .filter((session) => session.chargePointId === pointId)
        .sort(
          (a, b) =>
            (a.startedAt as Date).getTime() - (b.startedAt as Date).getTime(),
        );
      for (let index = 1; index < sorted.length; index += 1) {
        expect((sorted[index].startedAt as Date).getTime()).toBeGreaterThan(
          (sorted[index - 1].endedAt as Date).getTime(),
        );
      }
    }
  });

  it('bills private sessions to units at cost and visitors by card with demand', () => {
    const privateSession = sessions.find(
      (session) => session.regime === 'PRIVATE',
    );
    const visitorSession = sessions.find(
      (session) => session.regime === 'COMMERCIAL',
    );

    expect(privateSession).toMatchObject({
      status: 'CLOSED',
      lockedRateCents: 89,
      unitLabel: expect.stringMatching(/^[AB] · \d{2}$/),
    });
    expect(visitorSession?.unitLabel).toBeNull();
    expect([151, 189, 284]).toContain(visitorSession?.lockedRateCents);
    for (const session of sessions) {
      expect(session.totalCents).toBe(
        (session.energyCostCents ?? 0) + (session.idleFeeCents ?? 0),
      );
      expect(session.idleFeeCents ?? 0).toBeLessThanOrEqual(3000);
    }
  });

  it('spreads the sessions across the units', () => {
    const units = new Set(
      sessions
        .filter((session) => session.regime === 'PRIVATE')
        .map((session) => session.unitLabel),
    );
    expect(units.size).toBeGreaterThanOrEqual(18);
  });
});
