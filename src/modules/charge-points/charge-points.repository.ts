import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  ChargePoint,
  Charger,
  Organization,
  Tariff,
} from '../../generated/prisma/client.js';

export type ChargePointRecord = ChargePoint & {
  organization: Organization & { memberships: { id: string }[] };
  chargers: Charger[];
};

export type SitePoint = Pick<ChargePoint, 'id' | 'organizationId' | 'isOnline'>;

@Injectable()
export class ChargePointsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findVisibleTo(userId: string, id?: string): Promise<ChargePointRecord[]> {
    return this.prisma.chargePoint.findMany({
      where: {
        ...(id ? { id } : {}),
        OR: [
          { type: 'COMMERCIAL' },
          { organization: { memberships: { some: { userId } } } },
        ],
      },
      include: {
        organization: {
          include: {
            memberships: { where: { userId }, select: { id: true } },
          },
        },
        chargers: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ organization: { name: 'asc' } }, { code: 'asc' }],
    });
  }

  findSitePoints(organizationIds: string[]): Promise<SitePoint[]> {
    return this.prisma.chargePoint.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true, organizationId: true, isOnline: true },
    });
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
