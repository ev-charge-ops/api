import { Injectable } from '@nestjs/common';
import type { MonthRange } from '../../../common/time/sao-paulo-time.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { StatementSession } from '../domain/monthly-statement.js';
import {
  CostSharingRepository,
  type OrganizationSessionFilters,
  type OrganizationSessionRow,
  type OverviewSession,
  type SiteDemand,
} from './cost-sharing.repository.port.js';

const WH_PER_KWH = 1000;

function toWh(value: Prisma.Decimal): number {
  return Math.round(value.toNumber() * WH_PER_KWH);
}

function startedIn(range: MonthRange): Prisma.DateTimeFilter {
  return { gte: range.start, lt: range.end };
}

@Injectable()
export class CostSharingPrismaRepository extends CostSharingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findBillableSessions(
    organizationId: string,
    range: MonthRange,
  ): Promise<StatementSession[]> {
    const sessions = await this.prisma.chargingSession.findMany({
      where: {
        organizationId,
        regime: 'PRIVATE',
        startedAt: startedIn(range),
        OR: [
          { status: 'CLOSED' },
          { status: 'INTERRUPTED', energyKwh: { gt: 0 } },
        ],
      },
      select: {
        unitLabel: true,
        energyKwh: true,
        energyCostCents: true,
        idleFeeCents: true,
      },
    });
    return sessions.map((session) => ({
      unitLabel: session.unitLabel,
      energyWh: toWh(session.energyKwh),
      energyCostCents: session.energyCostCents,
      idleFeeCents: session.idleFeeCents,
    }));
  }

  async findUnitsWithVehicle(organizationId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, role: 'DRIVER', unitLabel: { not: null } },
      select: { unitLabel: true },
      distinct: ['unitLabel'],
    });
    return memberships.flatMap((membership) =>
      membership.unitLabel ? [membership.unitLabel] : [],
    );
  }

  async findAccessFeeCents(organizationId: string, at: Date): Promise<number> {
    const tariff = await this.prisma.tariff.findFirst({
      where: { organizationId, chargePointId: null, validFrom: { lt: at } },
      orderBy: { validFrom: 'desc' },
      select: { accessFeeCents: true },
    });
    return tariff?.accessFeeCents ?? 0;
  }

  async listSessions(
    organizationId: string,
    filters: OrganizationSessionFilters,
    page: { skip: number; take: number },
  ): Promise<{ items: OrganizationSessionRow[]; total: number }> {
    const where: Prisma.ChargingSessionWhereInput = {
      organizationId,
      ...(filters.range ? { startedAt: startedIn(filters.range) } : {}),
      ...(filters.unitLabel ? { unitLabel: filters.unitLabel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.chargingSession.findMany({
        where,
        include: {
          chargePoint: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.chargingSession.count({ where }),
    ]);
    return {
      total,
      items: sessions.map((session) => ({
        id: session.id,
        status: session.status,
        regime: session.regime,
        chargePoint: session.chargePoint,
        driver: session.user,
        unitLabel: session.unitLabel,
        startedAt: session.startedAt,
        chargingEndedAt: session.chargingEndedAt,
        endedAt: session.endedAt,
        energyWh: toWh(session.energyKwh),
        lockedRateCents: session.lockedRateCents,
        demandFactor: session.demandFactor.toNumber(),
        energyCostCents: session.energyCostCents,
        idleMinutes: session.idleMinutes,
        idleFeeCents: session.idleFeeCents,
        totalCents: session.totalCents,
        anomalyScore: session.anomalyScore?.toNumber() ?? null,
        isAnomaly: session.isAnomaly,
      })),
    };
  }

  async findSessionsStartedIn(
    organizationId: string,
    range: MonthRange,
  ): Promise<OverviewSession[]> {
    const sessions = await this.prisma.chargingSession.findMany({
      where: { organizationId, startedAt: startedIn(range) },
      select: {
        regime: true,
        status: true,
        startedAt: true,
        chargingEndedAt: true,
        endedAt: true,
        energyKwh: true,
        totalCents: true,
        allocatedPowerKw: true,
      },
    });
    return sessions.map((session) => ({
      ...session,
      energyWh: toWh(session.energyKwh),
      allocatedPowerKw: session.allocatedPowerKw.toNumber(),
    }));
  }

  async findSiteDemand(organizationId: string): Promise<SiteDemand> {
    const [organization, openSessions, charging] =
      await this.prisma.$transaction([
        this.prisma.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { contractedDemandKw: true, commonAreaReserveKw: true },
        }),
        this.prisma.chargingSession.count({
          where: {
            organizationId,
            status: { in: ['PENDING', 'ACTIVE', 'GRACE', 'IDLE'] },
          },
        }),
        this.prisma.chargingSession.aggregate({
          where: { organizationId, status: { in: ['PENDING', 'ACTIVE'] } },
          _sum: { allocatedPowerKw: true },
        }),
      ]);
    return {
      contractedDemandKw: organization.contractedDemandKw?.toNumber() ?? null,
      commonAreaReserveKw: organization.commonAreaReserveKw?.toNumber() ?? null,
      activeSessionsCount: openSessions,
      currentDemandKw: charging._sum.allocatedPowerKw?.toNumber() ?? 0,
    };
  }
}
