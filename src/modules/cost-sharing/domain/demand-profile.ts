export interface DemandInterval {
  start: Date;
  end: Date;
  powerKw: number;
  dayKey: string;
}

export const UPGRADE_ALERT_THRESHOLD_PERCENT = 80;

export function peakDemandKw(intervals: DemandInterval[]): number {
  const events = intervals
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .flatMap((interval) => [
      { at: interval.start.getTime(), delta: interval.powerKw },
      { at: interval.end.getTime(), delta: -interval.powerKw },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }
  return roundTo(peak, 2);
}

export function averageDailyPeakKw(intervals: DemandInterval[]): number {
  const byDay = new Map<string, DemandInterval[]>();
  for (const interval of intervals) {
    byDay.set(interval.dayKey, [
      ...(byDay.get(interval.dayKey) ?? []),
      interval,
    ]);
  }
  if (byDay.size === 0) {
    return 0;
  }
  const peaks = [...byDay.values()].map(peakDemandKw);
  return roundTo(peaks.reduce((sum, peak) => sum + peak, 0) / peaks.length, 2);
}

export function percentOf(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return roundTo((value / total) * 100, 1);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
