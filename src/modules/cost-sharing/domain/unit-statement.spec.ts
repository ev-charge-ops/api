import { saoPauloMonth } from '../../../common/time/sao-paulo-time.js';
import { buildMonthlyStatement } from './monthly-statement.js';
import {
  dailyEnergyOf,
  statementStatus,
  unitLineOf,
} from './unit-statement.js';

const AUGUST = saoPauloMonth(2026, 8);

const session = (
  unitLabel: string | null,
  startedAt: string,
  energyWh: number,
) => ({
  unitLabel,
  startedAt: new Date(startedAt),
  energyWh,
  energyCostCents: Math.round((energyWh * 89) / 1000),
  idleFeeCents: 0,
});

describe('statementStatus', () => {
  it('stays open until the month ends in Sao Paulo', () => {
    expect(statementStatus(AUGUST, new Date('2026-09-01T02:59:59.999Z'))).toBe(
      'OPEN',
    );
    expect(statementStatus(AUGUST, new Date('2026-09-01T03:00:00.000Z'))).toBe(
      'CLOSED',
    );
  });
});

describe('unitLineOf', () => {
  const statement = buildMonthlyStatement({
    unitsWithVehicle: ['B · 42'],
    accessFeeCents: 3500,
    sessions: [session('B · 42', '2026-08-03T22:00:00.000Z', 11_760)],
  });

  it('picks the line of the unit', () => {
    expect(unitLineOf(statement, 'B · 42')).toMatchObject({
      sessionsCount: 1,
      energyWh: 11_760,
      accessFeeCents: 3500,
      totalCents: 4547,
    });
  });

  it('returns an empty line for a unit without charges', () => {
    expect(unitLineOf(statement, 'A · 11')).toEqual({
      unitLabel: 'A · 11',
      sessionsCount: 0,
      energyWh: 0,
      energyCents: 0,
      accessFeeCents: 0,
      idleFeeCents: 0,
      totalCents: 0,
    });
  });
});

describe('dailyEnergyOf', () => {
  it('sums the energy of the unit per local day of the month', () => {
    const days = dailyEnergyOf(
      [
        session('B · 42', '2026-08-01T03:00:00.000Z', 4000),
        session('B · 42', '2026-08-04T02:30:00.000Z', 1000),
        session('B · 42', '2026-08-03T12:00:00.000Z', 500),
        session('A · 11', '2026-08-03T12:00:00.000Z', 9000),
        session(null, '2026-08-03T12:00:00.000Z', 9000),
        session('B · 42', '2026-09-01T02:00:00.000Z', 700),
      ],
      'B · 42',
      AUGUST,
    );

    expect(days).toHaveLength(31);
    expect(days.slice(0, 4)).toEqual([
      { date: '2026-08-01', energyWh: 4000 },
      { date: '2026-08-02', energyWh: 0 },
      { date: '2026-08-03', energyWh: 1500 },
      { date: '2026-08-04', energyWh: 0 },
    ]);
    expect(days[30]).toEqual({ date: '2026-08-31', energyWh: 700 });
  });

  it('covers every day of shorter months', () => {
    expect(dailyEnergyOf([], 'B · 42', saoPauloMonth(2027, 2))).toHaveLength(
      28,
    );
  });
});
