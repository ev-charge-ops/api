import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { ACTIVE_QUEUE_STATUSES, type QueueEntryRecord } from './queue-rules.js';

export const JoinQueueResult = {
  CREATED: 'CREATED',
  ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
  ACTIVE_QUEUE_EXISTS: 'ACTIVE_QUEUE_EXISTS',
} as const;

export type JoinQueueResult =
  (typeof JoinQueueResult)[keyof typeof JoinQueueResult];

const ENTRY_SELECT = {
  id: true,
  chargePointId: true,
  userId: true,
  status: true,
  reservedUntil: true,
  notifiedAt: true,
  endedAt: true,
  createdAt: true,
} as const;

const QUEUE_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

@Injectable()
export class QueueRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(chargePointIds: string[]): Promise<QueueEntryRecord[]> {
    if (chargePointIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.queueEntry.findMany({
      where: {
        chargePointId: { in: chargePointIds },
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
      select: ENTRY_SELECT,
      orderBy: QUEUE_ORDER,
    });
  }

  findActiveByUser(userId: string): Promise<QueueEntryRecord | null> {
    return this.prisma.queueEntry.findFirst({
      where: { userId, status: { in: ACTIVE_QUEUE_STATUSES } },
      select: ENTRY_SELECT,
    });
  }

  findLatest(
    userId: string,
    chargePointId: string,
  ): Promise<QueueEntryRecord | null> {
    return this.prisma.queueEntry.findFirst({
      where: { userId, chargePointId },
      select: ENTRY_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async expire(ids: string[], at: Date): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.queueEntry.updateMany({
      where: { id: { in: ids }, status: 'NOTIFIED' },
      data: { status: 'EXPIRED', endedAt: at },
    });
  }

  async promote(
    id: string,
    reservedUntil: Date,
    at: Date,
  ): Promise<QueueEntryRecord | null> {
    const { count } = await this.prisma.queueEntry.updateMany({
      where: { id, status: 'WAITING' },
      data: { status: 'NOTIFIED', reservedUntil, notifiedAt: at },
    });
    if (count === 0) {
      return null;
    }
    return this.prisma.queueEntry.findUnique({
      where: { id },
      select: ENTRY_SELECT,
    });
  }

  async close(
    id: string,
    status: 'LEFT' | 'FULFILLED',
    at: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.queueEntry.updateMany({
      where: { id, status: { in: ACTIVE_QUEUE_STATUSES } },
      data: { status, endedAt: at },
    });
    return count > 0;
  }

  join(
    userId: string,
    chargePointId: string,
    at: Date,
  ): Promise<{ result: JoinQueueResult; entry: QueueEntryRecord | null }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const active = await tx.queueEntry.findFirst({
        where: { userId, status: { in: ACTIVE_QUEUE_STATUSES } },
        select: ENTRY_SELECT,
      });
      if (active) {
        return {
          result:
            active.chargePointId === chargePointId
              ? JoinQueueResult.ALREADY_IN_QUEUE
              : JoinQueueResult.ACTIVE_QUEUE_EXISTS,
          entry: active,
        };
      }
      const entry = await tx.queueEntry.create({
        data: { userId, chargePointId, createdAt: at },
        select: ENTRY_SELECT,
      });
      return { result: JoinQueueResult.CREATED, entry };
    });
  }

  async pointName(chargePointId: string): Promise<string> {
    const point = await this.prisma.chargePoint.findUniqueOrThrow({
      where: { id: chargePointId },
      select: { name: true },
    });
    return point.name;
  }
}
