import type { QueueEntryStatus } from '../../../generated/prisma/enums.js';

export const QUEUE_RESERVATION_MINUTES = 10;

const MINUTE_IN_MS = 60_000;

export const ACTIVE_QUEUE_STATUSES: QueueEntryStatus[] = [
  'WAITING',
  'NOTIFIED',
];

export interface QueueEntryRecord {
  id: string;
  chargePointId: string;
  userId: string;
  status: QueueEntryStatus;
  reservedUntil: Date | null;
  notifiedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface QueuePlan {
  expiredIds: string[];
  promoteId: string | null;
}

export interface QueueSummary {
  queueLength: number;
  reservedUntil: Date | null;
  reservedForUserId: string | null;
  myEntry: QueueEntryRecord | null;
  myPosition: number | null;
}

export function isActiveEntry(
  entry: Pick<QueueEntryRecord, 'status'>,
): boolean {
  return ACTIVE_QUEUE_STATUSES.includes(entry.status);
}

export function reservationEnd(now: Date): Date {
  return new Date(now.getTime() + QUEUE_RESERVATION_MINUTES * MINUTE_IN_MS);
}

function isReservationOver(entry: QueueEntryRecord, now: Date): boolean {
  return (
    entry.status === 'NOTIFIED' &&
    entry.reservedUntil !== null &&
    entry.reservedUntil.getTime() <= now.getTime()
  );
}

export function planAdvance(
  activeEntries: QueueEntryRecord[],
  pointAvailable: boolean,
  now: Date,
): QueuePlan {
  const expiredIds = activeEntries
    .filter((entry) => isReservationOver(entry, now))
    .map((entry) => entry.id);
  const remaining = activeEntries.filter(
    (entry) => !expiredIds.includes(entry.id),
  );
  const reserved = remaining.some((entry) => entry.status === 'NOTIFIED');
  const head = remaining.find((entry) => entry.status === 'WAITING');
  return {
    expiredIds,
    promoteId: pointAvailable && !reserved && head ? head.id : null,
  };
}

export function applyPlan(
  activeEntries: QueueEntryRecord[],
  plan: QueuePlan,
  promoted: QueueEntryRecord | null,
): QueueEntryRecord[] {
  return activeEntries
    .filter((entry) => !plan.expiredIds.includes(entry.id))
    .map((entry) => (promoted && entry.id === promoted.id ? promoted : entry));
}

export function summarize(
  activeEntries: QueueEntryRecord[],
  userId: string,
): QueueSummary {
  const reserved = activeEntries.find((entry) => entry.status === 'NOTIFIED');
  const index = activeEntries.findIndex((entry) => entry.userId === userId);
  return {
    queueLength: activeEntries.length,
    reservedUntil: reserved?.reservedUntil ?? null,
    reservedForUserId: reserved?.userId ?? null,
    myEntry: index >= 0 ? activeEntries[index] : null,
    myPosition: index >= 0 ? index + 1 : null,
  };
}
