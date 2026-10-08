import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type ChargePoint,
  type Charger,
  type Membership,
  type Organization,
  Prisma,
  type Tariff,
} from '../../generated/prisma/client.js';
import type { OccupyingSessionStatus } from './charge-point-status.js';
import {
  type BoundingBox,
  boxAround,
  centerOf,
  type Coordinates,
  KM_PER_DEGREE,
  longitudeScale,
} from './geo.js';

export type ChargePointRecord = ChargePoint & {
  organization: Organization & {
    memberships: Pick<Membership, 'id' | 'unitLabel'>[];
  };
  chargers: Charger[];
};

export type SitePoint = Pick<
  ChargePoint,
  'id' | 'organizationId' | 'isOnline' | 'type'
>;

export type MapPointRecord = Pick<
  ChargePoint,
  | 'id'
  | 'organizationId'
  | 'code'
  | 'name'
  | 'type'
  | 'latitude'
  | 'longitude'
  | 'maxPowerKw'
  | 'isOnline'
  | 'photoUrl'
  | 'source'
> & {
  organization: Pick<Organization, 'name'>;
  chargers: Pick<Charger, 'connector'>[];
};

export interface ClusterRecord {
  latitude: number;
  longitude: number;
  count: number;
  availableCount: number;
}

export const OCCUPYING_SESSION_STATUSES: OccupyingSessionStatus[] = [
  'AWAITING_PAYMENT',
  'PENDING',
  'ACTIVE',
  'GRACE',
  'IDLE',
];

const OCCUPYING_STATUS_LIST = Prisma.join(
  OCCUPYING_SESSION_STATUSES.map(
    (status) => Prisma.sql`${status}::"ChargingSessionStatus"`,
  ),
);

function insideBox(box: BoundingBox): Prisma.Sql {
  return Prisma.sql`cp."latitude" BETWEEN ${box.minLat} AND ${box.maxLat} AND cp."longitude" BETWEEN ${box.minLng} AND ${box.maxLng}`;
}

function visibleTo(userId: string): Prisma.Sql {
  return Prisma.sql`(cp."type" = 'COMMERCIAL' OR EXISTS (SELECT 1 FROM "Membership" m WHERE m."organizationId" = cp."organizationId" AND m."userId" = ${userId}))`;
}

@Injectable()
export class ChargePointsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findVisibleTo(
    userId: string,
    filter: { id?: string; ids?: string[]; organizationId?: string } = {},
  ): Promise<ChargePointRecord[]> {
    return this.prisma.chargePoint.findMany({
      where: {
        ...(filter.id ? { id: filter.id } : {}),
        ...(filter.ids ? { id: { in: filter.ids } } : {}),
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

  async findCondoCentroid(userId: string): Promise<Coordinates | null> {
    const [row] = await this.prisma.$queryRaw<
      { latitude: number | null; longitude: number | null }[]
    >`
      SELECT AVG(cp."latitude")::float8 AS "latitude", AVG(cp."longitude")::float8 AS "longitude"
      FROM "ChargePoint" cp
      JOIN "Organization" o ON o."id" = cp."organizationId" AND o."type" = 'PRIVATE'
      JOIN "Membership" m ON m."organizationId" = o."id" AND m."userId" = ${userId}
    `;
    if (!row || row.latitude === null || row.longitude === null) {
      return null;
    }
    return { latitude: row.latitude, longitude: row.longitude };
  }

  async findMemberPrivateIds(userId: string, limit: number): Promise<string[]> {
    const points = await this.prisma.chargePoint.findMany({
      where: {
        type: 'PRIVATE',
        organization: { memberships: { some: { userId } } },
      },
      select: { id: true },
      orderBy: [{ organizationId: 'asc' }, { code: 'asc' }],
      take: limit,
    });
    return points.map((point) => point.id);
  }

  async findCommercialIdsNear(
    origin: Coordinates,
    radiusKm: number,
    limit: number,
  ): Promise<string[]> {
    if (limit <= 0) {
      return [];
    }
    const scale = longitudeScale(origin.latitude);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT cp."id"
      FROM "ChargePoint" cp
      WHERE cp."type" = 'COMMERCIAL'
        AND ${insideBox(boxAround(origin, radiusKm))}
        AND ${KM_PER_DEGREE} * SQRT(POWER(cp."latitude" - ${origin.latitude}, 2) + POWER((cp."longitude" - ${origin.longitude}) * ${scale}, 2)) <= ${radiusKm}
      ORDER BY POWER(cp."latitude" - ${origin.latitude}, 2) + POWER((cp."longitude" - ${origin.longitude}) * ${scale}, 2), cp."id"
      LIMIT ${limit}
    `;
    return rows.map((row) => row.id);
  }

  async findIdsInBox(
    userId: string,
    box: BoundingBox,
    limit: number,
  ): Promise<string[]> {
    const center = centerOf(box);
    const scale = longitudeScale(center.latitude);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT cp."id"
      FROM "ChargePoint" cp
      WHERE ${insideBox(box)} AND ${visibleTo(userId)}
      ORDER BY POWER(cp."latitude" - ${center.latitude}, 2) + POWER((cp."longitude" - ${center.longitude}) * ${scale}, 2), cp."id"
      LIMIT ${limit}
    `;
    return rows.map((row) => row.id);
  }

  findMapPoints(ids: string[]): Promise<MapPointRecord[]> {
    return this.prisma.chargePoint.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        organizationId: true,
        code: true,
        name: true,
        type: true,
        latitude: true,
        longitude: true,
        maxPowerKw: true,
        isOnline: true,
        photoUrl: true,
        source: true,
        organization: { select: { name: true } },
        chargers: {
          select: { connector: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
  }

  findClusters(
    userId: string,
    box: BoundingBox,
    cellDegrees: number,
  ): Promise<ClusterRecord[]> {
    return this.prisma.$queryRaw<ClusterRecord[]>`
      SELECT AVG(cp."latitude")::float8 AS "latitude",
        AVG(cp."longitude")::float8 AS "longitude",
        COUNT(*)::int AS "count",
        (COUNT(*) FILTER (
          WHERE cp."isOnline" AND NOT EXISTS (
            SELECT 1 FROM "ChargingSession" s
            WHERE s."chargePointId" = cp."id" AND s."status" IN (${OCCUPYING_STATUS_LIST})
          )
        ))::int AS "availableCount"
      FROM "ChargePoint" cp
      WHERE ${insideBox(box)} AND ${visibleTo(userId)}
      GROUP BY FLOOR(cp."latitude" / ${cellDegrees}), FLOOR(cp."longitude" / ${cellDegrees})
      ORDER BY "count" DESC
    `;
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
      select: { id: true, organizationId: true, isOnline: true, type: true },
    });
  }

  findOnlineState(
    id: string,
  ): Promise<Pick<ChargePoint, 'id' | 'isOnline'> | null> {
    return this.prisma.chargePoint.findUnique({
      where: { id },
      select: { id: true, isOnline: true },
    });
  }

  async hasOpenSession(
    userId: string,
    chargePointId: string,
  ): Promise<boolean> {
    const session = await this.prisma.chargingSession.findFirst({
      where: {
        userId,
        chargePointId,
        status: { in: OCCUPYING_SESSION_STATUSES },
      },
      select: { id: true },
    });
    return session !== null;
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
