import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  ChargePoint,
  Charger,
  Membership,
  Organization,
  Tariff,
} from '../../generated/prisma/client.js';
import type { OccupyingSessionStatus } from './charge-point-status.js';

export type ChargePointRecord = ChargePoint & {
  organization: Organization & {
    memberships: Pick<Membership, 'id' | 'unitLabel'>[];
  };
  chargers: Charger[];
};

export type SitePoint = Pick<ChargePoint, 'id' | 'organizationId' | 'isOnline'>;

export const OCCUPYING_SESSION_STATUSES: OccupyingSessionStatus[] = [
  'AWAITING_PAYMENT',
  'PENDING',
  'ACTIVE',
  'GRACE',
  'IDLE',
];

@Injectable()
export class ChargePointsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findVisibleTo(
    userId: string,
    filter: { id?: string; organizationId?: string } = {},
  ): Promise<ChargePointRecord[]> {
    return this.prisma.chargePoint.findMany({
      where: {
        ...(filter.id ? { id: filter.id } : {}),
        ...(filter.organizationId
          ? { organizationId: filter.organizationId }
          : {}),
        OR: [
          { type: 'COMMERCIAL' },
          { organization: { memberships: { some: { userId } } } },
        ],
      },
      include: {
        organization: {
          include: {
            memberships: {
              where: { userId },
              select: { id: true, unitLabel: true },
            },
          },
        },
        chargers: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ organization: { name: 'asc' } }, { code: 'asc' }],
    });
  }

  findByOrganization(organizationId: string): Promise<ChargePoint[]> {
    return this.prisma.chargePoint.findMany({
      where: { organizationId },
      orderBy: { code: 'asc' },
    });
  }

  findSitePoints(organizationIds: string[]): Promise<SitePoint[]> {
    return this.prisma.chargePoint.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true, organizationId: true, isOnline: true },
    });
  }

  async findOccupyingSessions(
    chargePointIds: string[],
  ): Promise<Map<string, OccupyingSessionStatus>> {
    const sessions = await this.prisma.chargingSession.findMany({
      where: {
        chargePointId: { in: chargePointIds },
        status: { in: OCCUPYING_SESSION_STATUSES },
      },
      select: { chargePointId: true, status: true },
    });
    return new Map(
      sessions.map((session) => [
        session.chargePointId,
        session.status as OccupyingSessionStatus,
      ]),
    );
  }

  findTariffs(organizationIds: string[], at: Date): Promise<Tariff[]> {
    return this.prisma.tariff.findMany({
      where: {
        organizationId: { in: organizationIds },
        validFrom: { lte: at },
      },
      orderBy: { validFrom: 'desc' },
    });
  }
}
