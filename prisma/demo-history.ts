import { createHash } from 'node:crypto';
import {
  saoPauloDate,
  saoPauloMonthOf,
} from '../src/common/time/sao-paulo-time.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { ruleDemandFactor } from '../src/modules/intelligence/demand-factor/rule-demand-factor.provider.js';

const RESIDENT_NAMES = [
  'Ana Ribeiro',
  'Marcelo Tavares',
  'Juliana Prado',
  'Fernando Lisboa',
  'Camila Nogueira',
  'Rodrigo Sampaio',
  'Beatriz Amaral',
  'Thiago Vasconcelos',
  'Patrícia Machado',
  'Eduardo Bastos',
  'Bruna Salgado',
  'Alexandre Pires',
  'Natália Cordeiro',
  'Rafael Bittencourt',
  'Isabela Menezes',
  'Caio Monteiro',
  'Verônica Alencar',
  'Daniel Siqueira',
  'Tatiana Braga',
  'Murilo Cavalcanti',
];

const MONTHS_OF_HISTORY = 3;
const BATTERY_CAPACITY_KWH = 50;
const GRACE_MINUTES = 10;
const IDLE_FEE_CENTS_PER_MINUTE = 25;
const IDLE_FEE_CAP_CENTS = 3000;
const MINUTE_IN_MS = 60_000;

export interface DemoResident {
  name: string;
  email: string;
  unitLabel: string;
}

export interface HistoryPoint {
  id: string;
  code: string;
  type: 'PRIVATE' | 'COMMERCIAL';
  maxPowerKw: number;
  rateCents: number;
}

export interface HistoryDriver {
  userId: string;
  unitLabel: string;
}

export interface HistoryInput {
  organizationId: string;
  now: Date;
  points: HistoryPoint[];
  drivers: HistoryDriver[];
}

export function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ /g, '.');
}

export function buildDemoResidents(): DemoResident[] {
  return RESIDENT_NAMES.map((name, index) => {
    const tower = index < 10 ? 'A' : 'B';
    const position = index % 10;
    const floor = 1 + Math.floor(position / 4);
    const apartment = floor * 10 + (position % 4) + 1;
    return {
      name,
      email: `${slug(name)}@example.com`,
      unitLabel: `${tower} · ${apartment}`,
    };
  });
}

export function deterministicId(key: string): string {
  const hex = createHash('sha1').update(key).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

interface Slot {
  name: string;
  fromHour: number;
  toHour: number;
  probability: number;
}

const PRIVATE_SLOTS: Slot[] = [
  { name: 'morning', fromHour: 6, toHour: 9, probability: 0.4 },
  { name: 'evening', fromHour: 18, toHour: 23, probability: 0.8 },
];

const VISITOR_SLOT: Slot = {
  name: 'day',
  fromHour: 10,
  toHour: 20,
  probability: 0.3,
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_IN_MS);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonths(now: Date): { year: number; month: number }[] {
  const current = saoPauloMonthOf(now);
  return Array.from({ length: MONTHS_OF_HISTORY }, (_, index) => {
    const offset = MONTHS_OF_HISTORY - 1 - index;
    const total = current.year * 12 + (current.month - 1) - offset;
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
  });
}

export function buildDemoHistory(
  input: HistoryInput,
): Prisma.ChargingSessionCreateManyInput[] {
  const sessions: Prisma.ChargingSessionCreateManyInput[] = [];
  for (const { year, month } of previousMonths(input.now)) {
    const random = createRandom(year * 100 + month);
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      for (const point of input.points) {
        const slots = point.type === 'PRIVATE' ? PRIVATE_SLOTS : [VISITOR_SLOT];
        for (const slot of slots) {
          const occurs = random() < slot.probability;
          const values = Array.from({ length: 6 }, random);
          if (!occurs) {
            continue;
          }
          const session = buildSession(input, point, slot, values, {
            year,
            month,
            day,
          });
          if (session.endedAt && new Date(session.endedAt) < input.now) {
            sessions.push(session);
          }
        }
      }
    }
  }
  return sessions;
}

function buildSession(
  input: HistoryInput,
  point: HistoryPoint,
  slot: Slot,
  values: number[],
  date: { year: number; month: number; day: number },
): Prisma.ChargingSessionCreateManyInput {
  const [
    hourValue,
    minuteValue,
    energyValue,
    idleChance,
    idleValue,
    driverValue,
  ] = values;
  const hour =
    slot.fromHour + Math.floor(hourValue * (slot.toHour - slot.fromHour + 1));
  const minute = Math.floor(minuteValue * 60);
  const startedAt = saoPauloDate(date.year, date.month, date.day, hour, minute);
  const isPrivate = point.type === 'PRIVATE';
  const energyWh = Math.round(
    (isPrivate ? 6 + energyValue * 14 : 5 + energyValue * 20) * 1000,
  );
  const powerKw = point.maxPowerKw;
  const chargingMinutes = Math.ceil((energyWh / 1000 / powerKw) * 60);
  const chargingEndedAt = addMinutes(startedAt, chargingMinutes);
  const idleMinutes = idleChance > 0.72 ? 2 + Math.floor(idleValue * 12) : 0;
  const endedAt = addMinutes(
    chargingEndedAt,
    idleMinutes > 0
      ? GRACE_MINUTES + idleMinutes
      : Math.floor(idleValue * GRACE_MINUTES),
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
  const driver = input.drivers[Math.floor(driverValue * input.drivers.length)];
  const energyCostCents = Math.round((energyWh * rateCents) / 1000);
  const idleFeeCents = Math.min(
    IDLE_FEE_CAP_CENTS,
    idleMinutes * IDLE_FEE_CENTS_PER_MINUTE,
  );
  const socGain = Math.round((energyWh / 1000 / BATTERY_CAPACITY_KWH) * 100);
  const initialSoc = Math.max(5, 100 - socGain);
  const energyKwh = (energyWh / 1000).toFixed(3);
  const dateKey = `${date.year}-${date.month}-${date.day}`;

  return {
    id: deterministicId(`demo-session:${point.code}:${dateKey}:${slot.name}`),
    userId: driver.userId,
    chargePointId: point.id,
    organizationId: input.organizationId,
    unitLabel: isPrivate ? driver.unitLabel : null,
    regime: point.type,
    status: 'CLOSED',
    limitType: 'FULL',
    targetEnergyKwh: energyKwh,
    allocatedPowerKw: powerKw,
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
  };
}

export async function upsertDemoResidents(
  prisma: Pick<PrismaClient, 'user' | 'membership'>,
  organizationId: string,
  residents: DemoResident[],
): Promise<HistoryDriver[]> {
  const drivers: HistoryDriver[] = [];
  for (const resident of residents) {
    const user = await prisma.user.upsert({
      where: { email: resident.email },
      update: { name: resident.name },
      create: { name: resident.name, email: resident.email, role: 'DRIVER' },
    });
    await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId } },
      update: { unitLabel: resident.unitLabel },
      create: {
        userId: user.id,
        organizationId,
        role: 'DRIVER',
        unitLabel: resident.unitLabel,
      },
    });
    drivers.push({ userId: user.id, unitLabel: resident.unitLabel });
  }
  return drivers;
}

export async function insertDemoHistory(
  prisma: Pick<PrismaClient, 'chargingSession'>,
  sessions: Prisma.ChargingSessionCreateManyInput[],
): Promise<number> {
  const { count } = await prisma.chargingSession.createMany({
    data: sessions,
    skipDuplicates: true,
  });
  return count;
}
