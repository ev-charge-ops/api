import {
  isVisitorSession,
  type MonthSession,
  monthPeak,
  monthTotals,
} from './overview-metrics.js';

const at = (time: string) => new Date(`2026-08-10T${time}:00-03:00`);

function session(overrides: Partial<MonthSession> = {}): MonthSession {
  return {
    id: 'session-1',
    regime: 'PRIVATE',
    status: 'CLOSED',
    startedAt: at('19:00'),
    chargingEndedAt: at('20:00'),
    endedAt: at('20:10'),
    energyWh: 7000,
    energyCostCents: 623,
    totalCents: 623,
    allocatedPowerKw: 7,
    isMember: true,
    ...overrides,
  };
}

describe('monthTotals', () => {
  it('adds energy, sessions and amounts', () => {
    expect(
      monthTotals([
        session(),
        session({ energyWh: 4050, energyCostCents: 360, totalCents: 510 }),
        session({ energyWh: 0, energyCostCents: 0, totalCents: 0 }),
      ]),
    ).toEqual({
      energyWh: 11_050,
      sessionsCount: 3,
      energyCents: 983,
      totalCents: 1133,
    });
  });
});

describe('isVisitorSession', () => {
  it('counts commercial points and drivers outside the organization', () => {
    expect(isVisitorSession(session())).toBe(false);
    expect(isVisitorSession(session({ regime: 'COMMERCIAL' }))).toBe(true);
    expect(isVisitorSession(session({ isMember: false }))).toBe(true);
  });
});

describe('monthPeak', () => {
  it('adds the power of overlapping charging sessions and tells when', () => {
    const peak = monthPeak(
      [
        session({ id: 'a' }),
        session({
          id: 'b',
          startedAt: at('19:30'),
          chargingEndedAt: at('21:00'),
          allocatedPowerKw: 22,
        }),
      ],
      new Map(),
      at('23:00'),
    );

    expect(peak).toEqual({ demandKw: 29, at: at('19:30') });
  });

  it('follows the readings of live sessions until now', () => {
    const peak = monthPeak(
      [
        session({ id: 'a' }),
        session({
          id: 'live',
          status: 'ACTIVE',
          startedAt: at('19:40'),
          chargingEndedAt: null,
          endedAt: null,
          energyWh: 0,
          allocatedPowerKw: 11,
        }),
      ],
      new Map([['live', [{ at: at('19:50'), powerKw: 3.5 }]]]),
      at('20:30'),
    );

    expect(peak).toEqual({ demandKw: 18, at: at('19:40') });
  });

  it('ignores sessions that never charged', () => {
    expect(
      monthPeak(
        [
          session({
            status: 'INTERRUPTED',
            energyWh: 0,
            chargingEndedAt: at('19:01'),
          }),
          session({
            status: 'AWAITING_PAYMENT',
            energyWh: 0,
            chargingEndedAt: null,
          }),
        ],
        new Map(),
        at('20:00'),
      ),
    ).toEqual({ demandKw: 0, at: null });
  });
});
