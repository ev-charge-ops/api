import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import type { Organization, Tariff } from '../../generated/prisma/client.js';
import type { ChargePointType } from '../../generated/prisma/enums.js';
import {
  type DemandFactor,
  DemandFactorProvider,
} from '../intelligence/demand-factor/demand-factor.provider.js';
import {
  type ChargePointStatus,
  chargePointStatus,
  occupancyRatio,
} from './charge-point-status.js';
import {
  type ChargePointRecord,
  ChargePointsRepository,
} from './charge-points.repository.js';
import { ChargePointPricingDto } from './dto/charge-point-pricing.dto.js';
import { ChargePointResponseDto } from './dto/charge-point.response.dto.js';
import { ChargerResponseDto } from './dto/charger.response.dto.js';
import type { SiteCapacity } from './site-capacity.js';
import {
  appliesDemandFactor,
  effectiveTariff,
  pricePerKwhCents,
} from './tariff-rules.js';

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
}

interface PricedPoint {
  point: ChargePointRecord;
  status: ChargePointStatus;
  tariff: Tariff | null;
  demand: DemandFactor;
}

@Injectable()
export class ChargePointsService {
  constructor(
    private readonly repository: ChargePointsRepository,
    private readonly demandFactors: DemandFactorProvider,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<ChargePointResponseDto[]> {
    const points = await this.repository.findVisibleTo(userId);
    const priced = await this.price(points, this.clock.now());
    return priced.map(toResponse);
  }

  async get(userId: string, id: string): Promise<ChargePointResponseDto> {
    return toResponse(await this.findPriced(userId, id, this.clock.now()));
  }

  async quote(
    userId: string,
    chargePointId: string,
    at: Date,
  ): Promise<ChargePointQuote> {
    const { point, status, tariff, demand } = await this.findPriced(
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
    };
  }

  private async findPriced(
    userId: string,
    id: string,
    at: Date,
  ): Promise<PricedPoint> {
    const points = await this.repository.findVisibleTo(userId, id);
    if (points.length === 0) {
      throw new NotFoundException('Charge point not found');
    }
    const [priced] = await this.price(points, at);
    return priced;
  }

  private async price(
    points: ChargePointRecord[],
    at: Date,
  ): Promise<PricedPoint[]> {
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

    const demandCache = new Map<string, Promise<DemandFactor>>();
    const demandFor = (organizationId: string, type: ChargePointType) => {
      const key = `${organizationId}:${type}`;
      let demand = demandCache.get(key);
      if (!demand) {
        const siteStatuses = sitePoints
          .filter((point) => point.organizationId === organizationId)
          .map((point) => statuses.get(point.id) ?? 'AVAILABLE');
        demand = this.demandFactors.getFactor({
          at,
          chargePointType: type,
          occupancyRatio: occupancyRatio(siteStatuses),
          queueLength: 0,
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
      })),
    );
  }
}

function toResponse({
  point,
  status,
  tariff,
  demand,
}: PricedPoint): ChargePointResponseDto {
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
    status,
    isMember: point.organization.memberships.length > 0,
    charger: charger ? ChargerResponseDto.fromEntity(charger) : null,
    pricing: tariff
      ? Object.assign(new ChargePointPricingDto(), {
          pricePerKwhCents: pricePerKwhCents(point.type, tariff, demand.factor),
          utilityRateCents: tariff.utilityRateCents,
          baseRateCents: tariff.baseRateCents,
          demandFactor: demand.factor,
          demandLevel: demand.level,
          demandFactorSource: demand.source,
          demandModelVersion: demand.modelVersion,
          demandFactorApplied: appliesDemandFactor(point.type),
          idleFeeCentsPerMinute: tariff.idleFeeCentsPerMinute,
          idleFeeCapCents: tariff.idleFeeCapCents,
          gracePeriodMinutes: tariff.gracePeriodMinutes,
        })
      : null,
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
