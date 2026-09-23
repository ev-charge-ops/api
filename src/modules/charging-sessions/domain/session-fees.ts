const MINUTE_IN_MS = 60_000;
const WH_PER_KWH = 1000;

export function energyCostCents(
  energyWh: number,
  rateCentsPerKwh: number,
): number {
  return Math.round((energyWh * rateCentsPerKwh) / WH_PER_KWH);
}

export function idleFeeCents(
  idleMinutes: number,
  centsPerMinute: number,
  capCents: number,
): number {
  return Math.min(capCents, Math.max(0, idleMinutes) * centsPerMinute);
}

export function sessionMinutesBetween(
  from: Date,
  to: Date,
  timeScale: number,
): number {
  const elapsed = to.getTime() - from.getTime();
  if (elapsed <= 0) {
    return 0;
  }
  return Math.floor((elapsed * timeScale) / MINUTE_IN_MS);
}

export function addSessionMinutes(
  from: Date,
  minutes: number,
  timeScale: number,
): Date {
  return new Date(from.getTime() + (minutes * MINUTE_IN_MS) / timeScale);
}
