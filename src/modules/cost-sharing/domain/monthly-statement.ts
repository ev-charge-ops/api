export interface StatementSession {
  unitLabel: string | null;
  energyWh: number;
  energyCostCents: number;
  idleFeeCents: number;
}

export interface StatementAmounts {
  sessionsCount: number;
  energyWh: number;
  energyCents: number;
  accessFeeCents: number;
  idleFeeCents: number;
  totalCents: number;
}

export interface StatementLine extends StatementAmounts {
  unitLabel: string | null;
}

export interface MonthlyStatement {
  lines: StatementLine[];
  totals: StatementAmounts & { unitsCount: number };
}

export interface StatementInput {
  unitsWithVehicle: string[];
  sessions: StatementSession[];
  accessFeeCents: number;
}

const unitCollator = new Intl.Collator('pt-BR', { numeric: true });

function emptyAmounts(): StatementAmounts {
  return {
    sessionsCount: 0,
    energyWh: 0,
    energyCents: 0,
    accessFeeCents: 0,
    idleFeeCents: 0,
    totalCents: 0,
  };
}

export function compareUnits(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return unitCollator.compare(a, b);
}

export function buildMonthlyStatement(input: StatementInput): MonthlyStatement {
  const lines = new Map<string | null, StatementLine>();
  const lineFor = (unitLabel: string | null): StatementLine => {
    let line = lines.get(unitLabel);
    if (!line) {
      line = { unitLabel, ...emptyAmounts() };
      lines.set(unitLabel, line);
    }
    return line;
  };

  for (const unitLabel of new Set(input.unitsWithVehicle)) {
    lineFor(unitLabel).accessFeeCents = input.accessFeeCents;
  }
  for (const session of input.sessions) {
    const line = lineFor(session.unitLabel);
    line.sessionsCount += 1;
    line.energyWh += session.energyWh;
    line.energyCents += session.energyCostCents;
    line.idleFeeCents += session.idleFeeCents;
  }

  const sorted = [...lines.values()].sort((a, b) =>
    compareUnits(a.unitLabel, b.unitLabel),
  );
  const totals = { unitsCount: sorted.length, ...emptyAmounts() };
  for (const line of sorted) {
    line.totalCents =
      line.energyCents + line.accessFeeCents + line.idleFeeCents;
    totals.sessionsCount += line.sessionsCount;
    totals.energyWh += line.energyWh;
    totals.energyCents += line.energyCents;
    totals.accessFeeCents += line.accessFeeCents;
    totals.idleFeeCents += line.idleFeeCents;
    totals.totalCents += line.totalCents;
  }
  return { lines: sorted, totals };
}
