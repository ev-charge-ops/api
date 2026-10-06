export interface PowerStep {
  start: Date;
  end: Date;
  powerKw: number;
}

export interface DemandInterval extends PowerStep {
  dayKey: string;
}

export interface PowerReading {
  at: Date;
  powerKw: number;
}

export interface ChargingWindow {
  start: Date;
  end: Date;
  initialPowerKw: number;
  readings: PowerReading[];
}

export interface DemandPeak {
  demandKw: number;
  at: Date | null;
}

export const UPGRADE_ALERT_THRESHOLD_PERCENT = 80;

const PRECISION_DECIMALS = 6;

export function peakDemand(steps: PowerStep[]): DemandPeak {
  const events = steps
    .filter((step) => step.end.getTime() > step.start.getTime())
    .flatMap((step) => [
      { at: step.start.getTime(), delta: step.powerKw },
      { at: step.end.getTime(), delta: -step.powerKw },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak: DemandPeak = { demandKw: 0, at: null };
  for (const event of events) {
    current = roundTo(current + event.delta, PRECISION_DECIMALS);
    if (current > peak.demandKw) {
      peak = { demandKw: current, at: new Date(event.at) };
    }
  }
  return { demandKw: roundTo(peak.demandKw, 2), at: peak.at };
}

export function peakDemandKw(intervals: DemandInterval[]): number {
  return peakDemand(intervals).demandKw;
}

export function powerSteps(window: ChargingWindow): PowerStep[] {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const readings = window.readings
    .filter((reading) => {
      const at = reading.at.getTime();
      return at > start && at < end;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const boundaries = [
    window.start,
    ...readings.map((reading) => reading.at),
    window.end,
  ];
  const powers = [
    window.initialPowerKw,
    ...readings.map((reading) => reading.powerKw),
  ];
  return powers
    .map((powerKw, index) => ({
      start: boundaries[index],
      end: boundaries[index + 1],
      powerKw,
    }))
    .filter(
      (step) => step.powerKw > 0 && step.end.getTime() > step.start.getTime(),
    );
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
