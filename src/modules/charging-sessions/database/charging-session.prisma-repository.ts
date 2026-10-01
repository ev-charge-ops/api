import { Injectable } from '@nestjs/common';
import type { MonthRange } from '../../../common/time/sao-paulo-time.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  SESSION_INCLUDE,
  readingToSample,
  toCreateData,
  toDomain,
  toPaymentData,
  toReadingData,
  toStateData,
} from '../charging-session.mapper.js';
import type {
  ChargingSession,
  MeterSample,
} from '../domain/charging-session.entity.js';
import {
  OPEN_SESSION_STATUSES,
  SessionStatus,
} from '../domain/session-status.js';
import {
  ChargingSessionRepository,
  CreateSessionResult,
  type SessionDriver,
  type SessionPage,
} from './charging-session.repository.port.js';

@Injectable()
export class ChargingSessionPrismaRepository extends ChargingSessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<ChargingSession | null> {
    const record = await this.prisma.chargingSession.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
    return record ? toDomain(record) : null;
  }

  async findByPaymentIntentId(
    intentId: string,
  ): Promise<ChargingSession | null> {
    const record = await this.prisma.chargingSession.findFirst({
      where: { payment: { stripePaymentIntentId: intentId } },
      include: SESSION_INCLUDE,
    });
    return record ? toDomain(record) : null;
  }

  async findOpenByUser(userId: string): Promise<ChargingSession | null> {
    const record = await this.prisma.chargingSession.findFirst({
      where: { userId, status: { in: OPEN_SESSION_STATUSES } },
      include: SESSION_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
    return record ? toDomain(record) : null;
  }

  async listByUser(
    userId: string,
    page: { skip: number; take: number },
    range?: MonthRange,
  ): Promise<SessionPage> {
    const where = {
      userId,
      ...(range ? { startedAt: { gte: range.start, lt: range.end } } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.chargingSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: { startedAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.chargingSession.count({ where }),
    ]);
    return { items: records.map(toDomain), total };
  }

  async chargingPowerKw(organizationId: string): Promise<number> {
    const result = await this.prisma.chargingSession.aggregate({
      where: {
        organizationId,
        status: {
          in: [
            SessionStatus.AWAITING_PAYMENT,
            SessionStatus.PENDING,
            SessionStatus.ACTIVE,
          ],
        },
      },
      _sum: { allocatedPowerKw: true },
    });
    return result._sum.allocatedPowerKw?.toNumber() ?? 0;
  }

  createExclusive(session: ChargingSession): Promise<CreateSessionResult> {
    const props = session.toProps();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ChargePoint" WHERE "id" = ${props.chargePointId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${props.userId} FOR UPDATE`;
      const open = { status: { in: OPEN_SESSION_STATUSES } };
      const ownSession = await tx.chargingSession.findFirst({
        where: { userId: props.userId, ...open },
        select: { id: true },
      });
      if (ownSession) {
        return CreateSessionResult.ACTIVE_SESSION_EXISTS;
      }
      const pointSession = await tx.chargingSession.findFirst({
        where: { chargePointId: props.chargePointId, ...open },
        select: { id: true },
      });
      if (pointSession) {
        return CreateSessionResult.CHARGE_POINT_BUSY;
      }
      const created = await tx.chargingSession.create({
        data: toCreateData(props),
        select: { updatedAt: true },
      });
      session.markPersisted(created.updatedAt);
      return CreateSessionResult.CREATED;
    });
  }

  async save(
    session: ChargingSession,
    readings: MeterSample[],
  ): Promise<boolean> {
    const props = session.toProps();
    const version = new Date();
    const saved = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.chargingSession.updateMany({
        where: { id: props.id, updatedAt: props.version ?? undefined },
        data: { ...toStateData(props), updatedAt: version },
      });
      if (count === 0) {
        return false;
      }
      if (props.payment) {
        const payment = toPaymentData(props.payment);
        await tx.payment.upsert({
          where: { sessionId: props.id },
          create: { sessionId: props.id, ...payment },
          update: payment,
        });
      }
      if (readings.length > 0) {
        await tx.meterReading.createMany({
          data: readings.map((reading) => toReadingData(props.id, reading)),
        });
      }
      return true;
    });
    if (saved) {
      session.markPersisted(version);
    }
    return saved;
  }

  async findReadings(sessionId: string): Promise<MeterSample[]> {
    const readings = await this.prisma.meterReading.findMany({
      where: { sessionId },
      orderBy: { at: 'asc' },
    });
    return readings.map(readingToSample);
  }

  findDriver(userId: string): Promise<SessionDriver | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
  }
}
