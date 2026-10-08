import {
  saoPauloDate,
  saoPauloMonthOf,
} from '../src/common/time/sao-paulo-time.js';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  type SessionTimeline,
  sessionFeatures,
} from '../src/modules/charging-sessions/commands/stop-session/session-features.js';
import {
  type AnomalyScore,
  AnomalyScorer,
  type SessionFeatures,
} from '../src/modules/intelligence/anomaly/anomaly-scorer.port.js';
import { ruleDemandFactor } from '../src/modules/intelligence/demand-factor/rule-demand-factor.provider.js';
import {
  deterministicId,
  type HistoryDriver,
  type HistoryPoint,
} from './demo-history.js';

export const AnomalyKind = {
  METER_SPIKE: 'METER_SPIKE',
  ENERGY_BURST: 'ENERGY_BURST',
  MULTI_DAY_OCCUPATION: 'MULTI_DAY_OCCUPATION',
  EXTREME_IDLE: 'EXTREME_IDLE',
} as const;

export type AnomalyKind = (typeof AnomalyKind)[keyof typeof AnomalyKind];

interface AnomalyPattern {
  pointType: HistoryPoint['type'];
  hour: number;
  minute: number;
  energyKwh: number;
  chargingMinutes: number;
  pluggedMinutes: number;
}

const PATTERNS: Record<AnomalyKind, AnomalyPattern> = {
  METER_SPIKE: {
    pointType: 'PRIVATE',
    hour: 21,
    minute: 10,
    energyKwh: 41,
    chargingMinutes: 8,
    pluggedMinutes: 14,
  },
  ENERGY_BURST: {
    pointType: 'COMMERCIAL',
    hour: 14,
    minute: 20,
    energyKwh: 58,
    chargingMinutes: 11,
    pluggedMinutes: 20,
  },
  MULTI_DAY_OCCUPATION: {
    pointType: 'COMMERCIAL',
    hour: 17,
    minute: 0,
    energyKwh: 38,
    chargingMinutes: 105,
    pluggedMinutes: 52 * 60,
  },
  EXTREME_IDLE: {
    pointType: 'COMMERCIAL',
    hour: 10,
    minute: 0,
    energyKwh: 16,
    chargingMinutes: 70,
    pluggedMinutes: 18 * 60,
  },
};

interface AnomalyPlan {
  kind: AnomalyKind;
  monthsAgo: number;
  day: number;
  driverIndex: number;
}

const PLANS: AnomalyPlan[] = [
  { kind: 'METER_SPIKE', monthsAgo: 1, day: 9, driverIndex: 3 },
  { kind: 'MULTI_DAY_OCCUPATION', monthsAgo: 1, day: 18, driverIndex: 16 },
  { kind: 'EXTREME_IDLE', monthsAgo: 1, day: 23, driverIndex: 7 },
  { kind: 'ENERGY_BURST', monthsAgo: 1, day: 27, driverIndex: 11 },
  { kind: 'MULTI_DAY_OCCUPATION', monthsAgo: 0, day: 1, driverIndex: 5 },
  { kind: 'ENERGY_BURST', monthsAgo: 0, day: 3, driverIndex: 18 },
  { kind: 'METER_SPIKE', monthsAgo: 0, day: 4, driverIndex: 14 },
  { kind: 'EXTREME_IDLE', monthsAgo: 0, day: 5, driverIndex: 9 },
];

const SEARCH_DAYS = 10;
const BATTERY_CAPACITY_KWH = 50;
const GRACE_MINUTES = 10;
const IDLE_FEE_CENTS_PER_MINUTE = 25;
const IDLE_FEE_CAP_CENTS = 3000;
const MINUTE_IN_MS = 60_000;
const GAP_MINUTES = 15;

export interface OccupiedInterval {
  sessionId?: string;
  chargePointId: string;
  start: Date;
  end: Date;
}

export interface AnomalyInput {
  organizationId: string;
  now: Date;
  points: HistoryPoint[];
  drivers: HistoryDriver[];
  occupied: OccupiedInterval[];
}

export interface DemoAnomaly {
  id: string;
  kind: AnomalyKind;
  timeline: SessionTimeline;
  session: Prisma.ChargingSessionCreateManyInput;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_IN_MS);
}

function monthsBefore(now: Date, monthsAgo: number) {
  const current = saoPauloMonthOf(now);
  const total = current.year * 12 + (current.month - 1) - monthsAgo;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return {
    year,
    month,
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

function overlaps(
  occupied: OccupiedInterval[],
  chargePointId: string,
  start: Date,
  end: Date,
): boolean {
  const from = addMinutes(start, -GAP_MINUTES).getTime();
  const to = addMinutes(end, GAP_MINUTES).getTime();
  return occupied.some(
    (interval) =>
      interval.chargePointId === chargePointId &&
      interval.start.getTime() < to &&
      interval.end.getTime() > from,
  );
}

function findSlot(
  input: AnomalyInput,
  occupied: OccupiedInterval[],
  plan: AnomalyPlan,
): { point: HistoryPoint; startedAt: Date } | null {
  const pattern = PATTERNS[plan.kind];
  const { year, month, days } = monthsBefore(input.now, plan.monthsAgo);
  const points = input.points.filter(
    (point) => point.type === pattern.pointType,
  );
  const lastDay = Math.min(days, plan.day + SEARCH_DAYS - 1);
  for (let day = plan.day; day <= lastDay; day += 1) {
    const startedAt = saoPauloDate(
      year,
      month,
      day,
      pattern.hour,
      pattern.minute,
    );
    const endedAt = addMinutes(startedAt, pattern.pluggedMinutes);
    if (endedAt >= input.now) {
      return null;
    }
    const point = points.find(
      (candidate) => !overlaps(occupied, candidate.id, startedAt, endedAt),
    );
    if (point) {
      return { point, startedAt };
    }
  }
  return null;
}

function anomalyId(now: Date, plan: AnomalyPlan): string {
  const { year, month } = monthsBefore(now, plan.monthsAgo);
  return deterministicId(`demo-anomaly:${year}-${month}:${plan.kind}`);
}

export function buildDemoAnomalies(input: AnomalyInput): DemoAnomaly[] {
  const plannedIds = new Set(PLANS.map((plan) => anomalyId(input.now, plan)));
  const occupied = input.occupied.filter(
    (interval) => !interval.sessionId || !plannedIds.has(interval.sessionId),
  );
  const anomalies: DemoAnomaly[] = [];
  for (const plan of PLANS) {
    const slot = findSlot(input, occupied, plan);
    if (!slot) {
      continue;
    }
    const anomaly = buildAnomaly(input, plan, slot.point, slot.startedAt);
    occupied.push({
      chargePointId: slot.point.id,
      start: anomaly.timeline.startedAt,
      end: anomaly.timeline.endedAt ?? anomaly.timeline.startedAt,
    });
    anomalies.push(anomaly);
  }
  return anomalies;
}

function buildAnomaly(
  input: AnomalyInput,
  plan: AnomalyPlan,
  point: HistoryPoint,
  startedAt: Date,
): DemoAnomaly {
  const pattern = PATTERNS[plan.kind];
  const isPrivate = point.type === 'PRIVATE';
  const chargingEndedAt = addMinutes(startedAt, pattern.chargingMinutes);
  const endedAt = addMinutes(startedAt, pattern.pluggedMinutes);
  const idleMinutes = Math.max(
    0,
    pattern.pluggedMinutes - pattern.chargingMinutes - GRACE_MINUTES,
  );
  const demand = ruleDemandFactor({
    at: startedAt,
    chargePointType: point.type,
    occupancyRatio: 0,
    queueLength: 0,
  });
  const rateCents = isPrivate
    ? point.rateCents
    : Math.round(point.rateCents * demand.factor);
  const driver = input.drivers[plan.driverIndex % input.drivers.length];
  const energyWh = Math.round(pattern.energyKwh * 1000);
  const energyCostCents = Math.round((energyWh * rateCents) / 1000);
  const idleFeeCents = Math.min(
    IDLE_FEE_CAP_CENTS,
    idleMinutes * IDLE_FEE_CENTS_PER_MINUTE,
  );
  const socGain = Math.round((pattern.energyKwh / BATTERY_CAPACITY_KWH) * 100);
  const initialSoc = Math.max(5, 100 - socGain);
  const energyKwh = pattern.energyKwh.toFixed(3);
  const id = anomalyId(input.now, plan);

  return {
    id,
    kind: plan.kind,
    timeline: {
      regime: point.type,
      startedAt,
      chargingEndedAt,
      endedAt,
      energyWh,
      timeScale: 1,
    },
    session: {
      id,
      userId: driver.userId,
      chargePointId: point.id,
      organizationId: input.organizationId,
      unitLabel: isPrivate ? driver.unitLabel : null,
      regime: point.type,
      status: 'CLOSED',
      limitType: 'FULL',
      targetEnergyKwh: energyKwh,
      allocatedPowerKw: point.maxPowerKw,
      batteryCapacityKwh: BATTERY_CAPACITY_KWH,
      initialSocPercent: initialSoc,
      timeScale: 1,
      lockedRateCents: rateCents,
      demandFactor: demand.factor,
      demandFactorSource: 'RULE',
      idleFeeCentsPerMinute: IDLE_FEE_CENTS_PER_MINUTE,
      idleFeeCapCents: IDLE_FEE_CAP_CENTS,
      gracePeriodMinutes: GRACE_MINUTES,
      externalTransactionId: null,
      startedAt,
      chargingEndedAt,
      endedAt,
      telemetryReadAt: chargingEndedAt,
      energyKwh,
      powerKw: 0,
      socPercent: Math.min(100, initialSoc + socGain),
      energyCostCents,
      idleMinutes,
      idleFeeCents,
      totalCents: energyCostCents + idleFeeCents,
    },
  };
}

const RULE_THRESHOLD_SCORE = 0.5;
const RULE_MAX_CHARGING_POWER_KW = 33;
const RULE_LIMITS: Record<
  SessionFeatures['chargePointType'],
  { durationMinutes: number; idleMinutes: number }
> = {
  PRIVATE: { durationMinutes: 60 * 60, idleMinutes: 48 * 60 },
  COMMERCIAL: { durationMinutes: 24 * 60, idleMinutes: 8 * 60 },
};

export class RuleAnomalyScorer extends AnomalyScorer {
  score(features: SessionFeatures): Promise<AnomalyScore> {
    return Promise.resolve(ruleAnomalyScore(features));
  }
}

export function ruleAnomalyScore(features: SessionFeatures): AnomalyScore {
  const limits = RULE_LIMITS[features.chargePointType];
  const chargingHours = Math.max(
    (features.durationMinutes - features.idleMinutes) / 60,
    1 / 60,
  );
  const ratios = [
    features.energyKwh / chargingHours / RULE_MAX_CHARGING_POWER_KW,
    features.durationMinutes / limits.durationMinutes,
    features.idleMinutes / limits.idleMinutes,
  ];
  const ratio = Math.max(...ratios);
  const normalized =
    ratio < 1
      ? ratio * RULE_THRESHOLD_SCORE
      : 1 - (1 - RULE_THRESHOLD_SCORE) / ratio;
  const score = Math.round(normalized * 10_000) / 10_000;
  return {
    score,
    isAnomaly: score >= RULE_THRESHOLD_SCORE,
    modelVersion: null,
  };
}

export class FallbackAnomalyScorer extends AnomalyScorer {
  constructor(
    private readonly primary: AnomalyScorer,
    private readonly fallback: AnomalyScorer,
  ) {
    super();
  }

  async score(features: SessionFeatures): Promise<AnomalyScore | null> {
    return (
      (await this.primary.score(features)) ??
      (await this.fallback.score(features))
    );
  }
}

export async function findOccupiedIntervals(
  prisma: Pick<PrismaClient, 'chargingSession'>,
  chargePointIds: string[],
  now: Date,
): Promise<OccupiedInterval[]> {
  const sessions = await prisma.chargingSession.findMany({
    where: { chargePointId: { in: chargePointIds } },
    select: { id: true, chargePointId: true, startedAt: true, endedAt: true },
  });
  return sessions.map((session) => ({
    sessionId: session.id,
    chargePointId: session.chargePointId,
    start: session.startedAt,
    end: session.endedAt ?? now,
  }));
}

export async function insertDemoAnomalies(
  prisma: Pick<PrismaClient, 'chargingSession'>,
  anomalies: DemoAnomaly[],
  scorer: AnomalyScorer,
): Promise<number> {
  const existing = await prisma.chargingSession.findMany({
    where: { id: { in: anomalies.map((anomaly) => anomaly.id) } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((session) => session.id));
  const data: Prisma.ChargingSessionCreateManyInput[] = [];
  for (const anomaly of anomalies) {
    if (existingIds.has(anomaly.id)) {
      continue;
    }
    const result = await scorer.score(sessionFeatures(anomaly.timeline));
    data.push({
      ...anomaly.session,
      anomalyScore: result?.score ?? null,
      isAnomaly: result?.isAnomaly ?? null,
      anomalyModelVersion: result?.modelVersion ?? null,
      anomalyReviewStatus: result?.isAnomaly ? 'PENDING_REVIEW' : null,
    });
  }
  if (data.length === 0) {
    return 0;
  }
  const { count } = await prisma.chargingSession.createMany({
    data,
    skipDuplicates: true,
  });
  return count;
}
