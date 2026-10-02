import {
  type MonthRange,
  toSaoPauloTime,
} from '../../../common/time/sao-paulo-time.js';
import type {
  MonthlyStatement,
  StatementLine,
  StatementSession,
} from './monthly-statement.js';

export const StatementStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type StatementStatus =
  (typeof StatementStatus)[keyof typeof StatementStatus];

export interface DailyEnergy {
  date: string;
  energyWh: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function statementStatus(range: MonthRange, now: Date): StatementStatus {
  return now.getTime() >= range.end.getTime()
    ? StatementStatus.CLOSED
    : StatementStatus.OPEN;
}

export function unitLineOf(
  statement: MonthlyStatement,
  unitLabel: string,
): StatementLine {
  return (
    statement.lines.find((line) => line.unitLabel === unitLabel) ?? {
      unitLabel,
      sessionsCount: 0,
      energyWh: 0,
      energyCents: 0,
      accessFeeCents: 0,
      idleFeeCents: 0,
      totalCents: 0,
    }
  );
}

export function dailyEnergyOf(
  sessions: StatementSession[],
  unitLabel: string,
  range: MonthRange,
): DailyEnergy[] {
  const lastDay = toSaoPauloTime(new Date(range.end.getTime() - 1)).day;
  const totals = Array.from({ length: lastDay }, () => 0);
  for (const session of sessions) {
    if (session.unitLabel !== unitLabel) {
      continue;
    }
    totals[toSaoPauloTime(session.startedAt).day - 1] += session.energyWh;
  }
  return totals.map((energyWh, index) => ({
    date: `${range.year}-${pad(range.month)}-${pad(index + 1)}`,
    energyWh,
  }));
}
