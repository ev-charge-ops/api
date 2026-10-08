import {
  type DemandPeak,
  peakDemand,
  type PowerReading,
  powerSteps,
} from './demand-profile.js';

export interface MonthSession {
  id: string;
  regime: 'PRIVATE' | 'COMMERCIAL';
  status: string;
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  energyWh: number;
  energyCostCents: number;
  totalCents: number;
  allocatedPowerKw: number;
  isMember: boolean;
}

export interface MonthTotals {
  energyWh: number;
  sessionsCount: number;
  energyCents: number;
  totalCents: number;
}

const CHARGING_STATUS = 'ACTIVE';

export function monthTotals(sessions: MonthSession[]): MonthTotals {
  return sessions.reduce(
    (totals, session) => ({
      energyWh: totals.energyWh + session.energyWh,
      sessionsCount: totals.sessionsCount + 1,
      energyCents: totals.energyCents + session.energyCostCents,
      totalCents: totals.totalCents + session.totalCents,
    }),
    { energyWh: 0, sessionsCount: 0, energyCents: 0, totalCents: 0 },
  );
}

export function isVisitorSession(session: MonthSession): boolean {
  return session.regime === 'COMMERCIAL' || !session.isMember;
}

export function monthPeak(
  sessions: MonthSession[],
  readings: Map<string, PowerReading[]>,
  now: Date,
): DemandPeak {
  return peakDemand(
    sessions
      .filter(
        (session) =>
          session.energyWh > 0 ||
          session.status === CHARGING_STATUS ||
          readings.has(session.id),
      )
      .flatMap((session) =>
        powerSteps({
          start: session.startedAt,
          end:
            session.status === CHARGING_STATUS
              ? now
              : (session.chargingEndedAt ?? session.endedAt ?? now),
          initialPowerKw: session.allocatedPowerKw,
          readings: readings.get(session.id) ?? [],
        }),
      ),
  );
}
