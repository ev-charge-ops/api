import { buildMonthlyStatement } from './monthly-statement.js';
import {
  formatCents,
  formatKwh,
  statementToCsv,
  UTF8_BOM,
} from './statement-csv.js';

const session = (
  unitLabel: string | null,
  energyWh: number,
  energyCostCents: number,
  idleFeeCents = 0,
) => ({ unitLabel, energyWh, energyCostCents, idleFeeCents });

describe('buildMonthlyStatement', () => {
  const statement = buildMonthlyStatement({
    unitsWithVehicle: ['B · 42', 'A · 12', 'A · 2', 'B · 42'],
    accessFeeCents: 3500,
    sessions: [
      session('B · 42', 11_760, 1047),
      session('B · 42', 4050, 360, 150),
      session('A · 12', 9800, 872, 3000),
      session('C · 7', 1000, 89),
      session(null, 500, 45),
    ],
  });

  it('adds the access fee to every unit with a vehicle', () => {
    expect(
      statement.lines.map(({ unitLabel, accessFeeCents }) => [
        unitLabel,
        accessFeeCents,
      ]),
    ).toEqual([
      ['A · 2', 3500],
      ['A · 12', 3500],
      ['B · 42', 3500],
      ['C · 7', 0],
      [null, 0],
    ]);
  });

  it('sums energy at the locked price and idle fees per unit', () => {
    expect(statement.lines[2]).toEqual({
      unitLabel: 'B · 42',
      sessionsCount: 2,
      energyWh: 15_810,
      energyCents: 1407,
      accessFeeCents: 3500,
      idleFeeCents: 150,
      totalCents: 5057,
    });
    expect(statement.lines[0]).toMatchObject({
      sessionsCount: 0,
      energyWh: 0,
      totalCents: 3500,
    });
  });

  it('totals every line', () => {
    expect(statement.totals).toEqual({
      unitsCount: 5,
      sessionsCount: 5,
      energyWh: 27_110,
      energyCents: 2413,
      accessFeeCents: 10_500,
      idleFeeCents: 3150,
      totalCents: 16_063,
    });
  });
});

describe('statement CSV', () => {
  it('formats money and energy with a decimal comma and two decimals', () => {
    expect(formatCents(0)).toBe('0,00');
    expect(formatCents(5)).toBe('0,05');
    expect(formatCents(3500)).toBe('35,00');
    expect(formatCents(123_456)).toBe('1234,56');
    expect(formatKwh(11_760)).toBe('11,76');
    expect(formatKwh(4055)).toBe('4,06');
    expect(formatKwh(4054)).toBe('4,05');
    expect(formatKwh(1_234_567)).toBe('1234,57');
  });

  it('writes the importer layout with a BOM and semicolons', () => {
    const csv = statementToCsv(
      buildMonthlyStatement({
        unitsWithVehicle: ['B · 42', 'A · 11'],
        accessFeeCents: 3500,
        sessions: [
          session('B · 42', 11_760, 1047, 150),
          session(null, 500, 45),
          session('Bloco "C"; 1', 1000, 89),
        ],
      }),
    );

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'unidade;kwh;energia;acesso;ocupacao;total',
      'A · 11;0,00;0,00;35,00;0,00;35,00',
      'B · 42;11,76;10,47;35,00;1,50;46,97',
      '"Bloco ""C""; 1";1,00;0,89;0,00;0,00;0,89',
      'Sem unidade;0,50;0,45;0,00;0,00;0,45',
      '',
    ]);
  });
});
