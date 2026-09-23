import type { MonthlyStatement } from './monthly-statement.js';

export const STATEMENT_CSV_HEADER = 'unidade;kwh;energia;acesso;ocupacao;total';
export const UTF8_BOM = '﻿';
export const NO_UNIT_LABEL = 'Sem unidade';

const SEPARATOR = ';';
const LINE_BREAK = '\r\n';

export function formatHundredths(hundredths: number): string {
  const sign = hundredths < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(hundredths));
  const integer = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${integer},${fraction}`;
}

export function formatCents(cents: number): string {
  return formatHundredths(cents);
}

export function formatKwh(energyWh: number): string {
  return formatHundredths(energyWh / 10);
}

function escapeField(value: string): string {
  if (/[";\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function statementToCsv(statement: MonthlyStatement): string {
  const rows = statement.lines.map((line) =>
    [
      escapeField(line.unitLabel ?? NO_UNIT_LABEL),
      formatKwh(line.energyWh),
      formatCents(line.energyCents),
      formatCents(line.accessFeeCents),
      formatCents(line.idleFeeCents),
      formatCents(line.totalCents),
    ].join(SEPARATOR),
  );
  return `${UTF8_BOM}${[STATEMENT_CSV_HEADER, ...rows].join(LINE_BREAK)}${LINE_BREAK}`;
}
