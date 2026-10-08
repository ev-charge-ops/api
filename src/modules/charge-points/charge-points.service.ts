import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import type {
  ChargePoint,
  Organization,
  Tariff,
} from '../../generated/prisma/client.js';
import type { ChargePointType } from '../../generated/prisma/enums.js';
import type { DemandFactor } from '../intelligence/demand-factor/demand-factor.provider.js';
import {
  type ChargePointStatus,
  chargePointStatus,
  occupancyRatio,
} from './charge-point-status.js';
import {
  type ChargePointRecord,
  ChargePointsRepository,
  type MapPointRecord,
} from './charge-points.repository.js';
import { DemandFactorCache } from './demand-factor-cache.js';
import { ChargePointClusterResponseDto } from './dto/charge-point-cluster.response.dto.js';
import { ChargePointMapItemResponseDto } from './dto/charge-point-map-item.response.dto.js';
import { ChargePointPricingDto } from './dto/charge-point-pricing.dto.js';
import { ChargePointResponseDto } from './dto/charge-point.response.dto.js';
import { ChargerResponseDto } from './dto/charger.response.dto.js';
import { type BoundingBox, clusterCellDegrees, SAO_PAULO } from './geo.js';
import { ChargePointQueue } from './queue/charge-point-queue.js';
import { type QueueEntryRecord, summarize } from './queue/queue-rules.js';
import type { SiteCapacity } from './site-capacity.js';
import {
  appliesDemandFactor,
  effectiveTariff,
  pricePerKwhCents,
} from './tariff-rules.js';

export const NEARBY_RADIUS_KM = 25;
export const OCM_ATTRIBUTION =
  'Dados de localização © Open Charge Map (CC BY-SA 4.0)';
export const NEARBY_LIMIT = 200;

export interface ChargePointQuote {
  chargePointId: string;
  code: string;
  name: string;
  organizationId: string;
  type: ChargePointType;
  status: ChargePointStatus;
  maxPowerKw: number;
  chargerSerialNumber: string | null;
  membership: { unitLabel: string | null } | null;
  tariff: Tariff | null;
  demand: DemandFactor;
  pricePerKwhCents: number | null;
  capacity: SiteCapacity | null;
  reservedForUserId: string | null;
}

export interface OrganizationPointPricing {
  id: string;
  code: string;
  name: string;
  type: ChargePointType;
  maxPowerKw: number;
  photoUrl: string | null;
  status: ChargePointStatus;
  pricing: ChargePointPricingDto | null;
}

type PriceablePoint = Pick<
  ChargePoint,
  'id' | 'organizationId' | 'isOnline' | 'type'
>;

interface PricedPoint<T extends PriceablePoint = ChargePointRecord> {
  point: T;
  status: ChargePointStatus;
  tariff: Tariff | null;
  demand: DemandFactor;
  queue: QueueEntryRecord[];
}

@Injectable()
export class ChargePointsService {
  constructor(
    private readonly repository: ChargePointsRepository,
    private readonly demandFactors: DemandFactorCache,
    private readonly queue: ChargePointQueue,
    private readonly clock: Clock,
  ) {}

  async list(
    userId: string,
    organizationId?: string,
  ): Promise<ChargePointResponseDto[]> {
    const points = organizationId
      ? await this.repository.findVisibleTo(userId, { organizationId })
      : await this.findNearby(userId);
    const priced = await this.price(points, this.clock.now());
    return priced.map((item) => this.toResponse(item, userId));
  }

  async listInBox(
    userId: string,
    box: BoundingBox,
    limit: number,
  ): Promise<ChargePointMapItemResponseDto[]> {
    const ids = await this.repository.findIdsInBox(userId, box, limit);
    if (ids.length === 0) {
      return [];
    }
    const at = this.clock.now();
    const points = await this.repository.findMapPoints(ids);
    const organizationIds = [
      ...new Set(points.map((point) => point.organizationId)),
    ];
    const [occupying, tariffs] = await Promise.all([
      this.repository.findOccupyingSessions(ids),
      this.repository.findTariffs(organizationIds, at),
    ]);
    const byId = new Map(points.map((point) => [point.id, point]));
    return ids
      .map((id) => byId.get(id))
      .filter((point): point is MapPointRecord => point !== undefined)
      .map((point) =>
        this.toMapItem(
          point,
          chargePointStatus(point.isOnline, occupying.get(point.id) ?? null),
          effectiveTariff(
            tariffs.filter(
              (tariff) => tariff.organizationId === point.organizationId,
            ),
            point.id,
            at,
          ),
          at,
        ),
      );
  }

  async listClusters(
    userId: string,
    box: BoundingBox,
    zoom: number,
  ): Promise<ChargePointClusterResponseDto[]> {
    const clusters = await this.repository.findClusters(
      userId,
      box,
      clusterCellDegrees(zoom),
    );
    return clusters.map((cluster) =>
      Object.assign(new ChargePointClusterResponseDto(), cluster),
    );
  }

  async listOrganizationPricing(
    organizationId: string,
  ): Promise<OrganizationPointPricing[]> {
    const points = await this.repository.findByOrganization(organizationId);
    const priced = await this.price(points, this.clock.now());
    return priced.map(({ point, status, tariff, demand }) => ({
      id: point.id,
      code: point.code,
      name: point.name,
      type: point.type,
      maxPowerKw: point.maxPowerKw.toNumber(),
      photoUrl: point.photoUrl,
      status,
      pricing: toPricing(point.type, tariff, demand),
    }));
  }

  async get(userId: string, id: string): Promise<ChargePointResponseDto> {
    return this.toResponse(
      await this.findPriced(userId, id, this.clock.now()),
      userId,
    );
  }

  async quote(
    userId: string,
    chargePointId: string,
    at: Date,
  ): Promise<ChargePointQuote> {
    const { point, status, tariff, demand, queue } = await this.findPriced(
      userId,
      chargePointId,
      at,
    );
    const [membership] = point.organization.memberships;
    const [charger] = point.chargers;
    return {
      chargePointId: point.id,
      code: point.code,
      name: point.name,
      organizationId: point.organizationId,
      type: point.type,
      status,
      maxPowerKw: point.maxPowerKw.toNumber(),
      chargerSerialNumber: charger?.serialNumber ?? null,
      membership: membership ? { unitLabel: membership.unitLabel } : null,
      tariff,
      demand,
      pricePerKwhCents: tariff
        ? pricePerKwhCents(point.type, tariff, demand.factor)
        : null,
      capacity: siteCapacity(point.organization),
      reservedForUserId: summarize(queue, userId).reservedForUserId,
    };
  }

  private async findNearby(userId: string): Promise<ChargePointRecord[]> {
    const origin =
      (await this.repository.findCondoCentroid(userId)) ?? SAO_PAULO;
    const privateIds = await this.repository.findMemberPrivateIds(
      userId,
      NEARBY_LIMIT,
    );
    const commercialIds = await this.repository.findCommercialIdsNear(
      origin,
      NEARBY_RADIUS_KM,
      NEARBY_LIMIT - privateIds.length,
    );
    const ids = [...privateIds, ...commercialIds];
    if (ids.length === 0) {
      return [];
    }
    return this.repository.findVisibleTo(userId, { ids });
  }

  private toMapItem(
    point: MapPointRecord,
    status: ChargePointStatus,
    tariff: Tariff | null,
    at: Date,
  ): ChargePointMapItemResponseDto {
    const demand = this.demandFactors.peek(
      point.organizationId,
      point.type,
      at,
    );
    const [charger] = point.chargers;
    return Object.assign(new ChargePointMapItemResponseDto(), {
      id: point.id,
      code: point.code,
      name: point.name,
      type: point.type,
      status,
      latitude: point.latitude,
      longitude: point.longitude,
      maxPowerKw: point.maxPowerKw.toNumber(),
      connector: charger?.connector ?? null,
      operatorName: point.organization.name,
      basePricePerKwhCents: tariff
        ? pricePerKwhCents(point.type, tariff, 1)
        : null,
      pricePerKwhCents: tariff
        ? pricePerKwhCents(point.type, tariff, demand?.factor ?? 1)
        : null,
      photoUrl: point.photoUrl,
      source: point.source,
    });
  }

  private async findPriced(
    userId: string,
    id: string,
    at: Date,
  ): Promise<PricedPoint> {
    const points = await this.repository.findVisibleTo(userId, { id });
    if (points.length === 0) {
      throw new NotFoundException('Charge point not found');
    }
    const [priced] = await this.price(points, at);
    return priced;
  }

  private async price<T extends PriceablePoint>(
    points: T[],
    at: Date,
  ): Promise<PricedPoint<T>[]> {
    if (points.length === 0) {
      return [];
    }
    const organizationIds = [
      ...new Set(points.map((point) => point.organizationId)),
    ];
    const sitePoints = await this.repository.findSitePoints(organizationIds);
    const occupying = await this.repository.findOccupyingSessions(
      sitePoints.map((point) => point.id),
    );
    const tariffs = await this.repository.findTariffs(organizationIds, at);
    const statuses = new Map(
      sitePoints.map((point) => [
        point.id,
        chargePointStatus(point.isOnline, occupying.get(point.id) ?? null),
      ]),
    );
    const queues = await this.queue.refresh(statuses, at);

    const demandCache = new Map<string, Promise<DemandFactor>>();
    const demandFor = (organizationId: string, type: ChargePointType) => {
      const key = `${organizationId}:${type}`;
      let demand = demandCache.get(key);
      if (!demand) {
        const site = sitePoints.filter(
          (point) => point.organizationId === organizationId,
        );
        const siteStatuses = site.map(
          (point) => statuses.get(point.id) ?? 'AVAILABLE',
        );
        const queueLength = site
          .filter((point) => point.type === type)
          .reduce(
            (total, point) => total + (queues.get(point.id)?.length ?? 0),
            0,
          );
        demand = this.demandFactors.get(organizationId, {
          at,
          chargePointType: type,
          occupancyRatio: occupancyRatio(siteStatuses),
          queueLength,
        });
        demandCache.set(key, demand);
      }
      return demand;
    };

    return Promise.all(
      points.map(async (point) => ({
        point,
        status:
          statuses.get(point.id) ??
          chargePointStatus(point.isOnline, occupying.get(point.id) ?? null),
        tariff: effectiveTariff(
          tariffs.filter(
            (tariff) => tariff.organizationId === point.organizationId,
          ),
          point.id,
          at,
        ),
        demand: await demandFor(point.organizationId, point.type),
        queue: queues.get(point.id) ?? [],
      })),
    );
  }

  private toResponse(
    { point, status, tariff, demand, queue }: PricedPoint,
    userId: string,
  ): ChargePointResponseDto {
    const summary = summarize(queue, userId);
    return Object.assign(toResponse({ point, status, tariff, demand }), {
      queueLength: summary.queueLength,
      reservedUntil: summary.reservedUntil,
      myQueueEntry: summary.myEntry
        ? this.queue.toResponse(summary.myEntry, queue)
        : null,
    });
  }
}

function toResponse({
  point,
  status,
  tariff,
  demand,
}: Omit<PricedPoint, 'queue'>): ChargePointResponseDto {
  const [charger] = point.chargers;
  return Object.assign(new ChargePointResponseDto(), {
    id: point.id,
    organizationId: point.organizationId,
    organizationName: point.organization.name,
    code: point.code,
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    maxPowerKw: point.maxPowerKw.toNumber(),
    photoUrl: point.photoUrl,
    attribution: point.source === 'OCM' ? OCM_ATTRIBUTION : null,
    status,
    isMember: point.organization.memberships.length > 0,
    charger: charger ? ChargerResponseDto.fromEntity(charger) : null,
    pricing: toPricing(point.type, tariff, demand),
  });
}

function toPricing(
  type: ChargePointType,
  tariff: Tariff | null,
  demand: DemandFactor,
): ChargePointPricingDto | null {
  if (!tariff) {
    return null;
  }
  return Object.assign(new ChargePointPricingDto(), {
    pricePerKwhCents: pricePerKwhCents(type, tariff, demand.factor),
    utilityRateCents: tariff.utilityRateCents,
    baseRateCents: tariff.baseRateCents,
    demandFactor: demand.factor,
    demandLevel: demand.level,
    demandFactorSource: demand.source,
    demandModelVersion: demand.modelVersion,
    demandFactorApplied: appliesDemandFactor(type),
    idleFeeCentsPerMinute: tariff.idleFeeCentsPerMinute,
    idleFeeCapCents: tariff.idleFeeCapCents,
    gracePeriodMinutes: tariff.gracePeriodMinutes,
  });
}

function siteCapacity(organization: Organization): SiteCapacity | null {
  const { contractedDemandKw, commonAreaReserveKw, minChargingPowerKw } =
    organization;
  if (!contractedDemandKw) {
    return null;
  }
  return {
    contractedDemandKw: contractedDemandKw.toNumber(),
    commonAreaReserveKw: commonAreaReserveKw?.toNumber() ?? 0,
    minChargingPowerKw: minChargingPowerKw?.toNumber() ?? 0,
  };
}
