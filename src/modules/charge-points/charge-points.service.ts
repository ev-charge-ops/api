import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
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
  type SitePoint,
} from './charge-points.repository.js';
import { ChargePointPricingDto } from './dto/charge-point-pricing.dto.js';
import { ChargePointResponseDto } from './dto/charge-point.response.dto.js';
import { ChargerResponseDto } from './dto/charger.response.dto.js';
import {
  appliesDemandFactor,
  effectiveTariff,
  pricePerKwhCents,
} from './tariff-rules.js';

@Injectable()
export class ChargePointsService {
  constructor(
    private readonly repository: ChargePointsRepository,
    private readonly demandFactors: DemandFactorProvider,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<ChargePointResponseDto[]> {
    const points = await this.repository.findVisibleTo(userId);
    return this.present(points);
  }

  async get(userId: string, id: string): Promise<ChargePointResponseDto> {
    const points = await this.repository.findVisibleTo(userId, id);
    if (points.length === 0) {
      throw new NotFoundException('Charge point not found');
    }
    const [point] = await this.present(points);
    return point;
  }

  private async present(
    points: ChargePointRecord[],
  ): Promise<ChargePointResponseDto[]> {
    if (points.length === 0) {
      return [];
    }
    const now = this.clock.now();
    const organizationIds = [
      ...new Set(points.map((point) => point.organizationId)),
    ];
    const [sitePoints, tariffs] = await Promise.all([
      this.repository.findSitePoints(organizationIds),
      this.repository.findTariffs(organizationIds, now),
    ]);
    const statuses = new Map(
      sitePoints.map((point) => [point.id, statusOf(point)]),
    );
    const demand = this.demandResolver(sitePoints, statuses, now);

    return Promise.all(
      points.map(async (point) => {
        const status = statuses.get(point.id) ?? statusOf(point);
        const tariff = effectiveTariff(
          tariffs.filter(
            (item) => item.organizationId === point.organizationId,
          ),
          point.id,
          now,
        );
        let pricing: ChargePointPricingDto | null = null;
        if (tariff) {
          const factor = await demand(point.organizationId, point.type);
          pricing = Object.assign(new ChargePointPricingDto(), {
            pricePerKwhCents: pricePerKwhCents(
              point.type,
              tariff,
              factor.factor,
            ),
            utilityRateCents: tariff.utilityRateCents,
            baseRateCents: tariff.baseRateCents,
            demandFactor: factor.factor,
            demandLevel: factor.level,
            demandFactorSource: factor.source,
            demandFactorApplied: appliesDemandFactor(point.type),
            idleFeeCentsPerMinute: tariff.idleFeeCentsPerMinute,
            idleFeeCapCents: tariff.idleFeeCapCents,
            gracePeriodMinutes: tariff.gracePeriodMinutes,
          });
        }
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
          pricing,
        });
      }),
    );
  }

  private demandResolver(
    sitePoints: SitePoint[],
    statuses: Map<string, ChargePointStatus>,
    at: Date,
  ): (organizationId: string, type: ChargePointType) => Promise<DemandFactor> {
    const cache = new Map<string, Promise<DemandFactor>>();
    return (organizationId, type) => {
      const key = `${organizationId}:${type}`;
      let factor = cache.get(key);
      if (!factor) {
        const siteStatuses = sitePoints
          .filter((point) => point.organizationId === organizationId)
          .map((point) => statuses.get(point.id) ?? statusOf(point));
        factor = this.demandFactors.getFactor({
          at,
          chargePointType: type,
          occupancyRatio: occupancyRatio(siteStatuses),
          queueLength: 0,
        });
        cache.set(key, factor);
      }
      return factor;
    };
  }
}

function statusOf(point: Pick<SitePoint, 'isOnline'>): ChargePointStatus {
  return chargePointStatus(point.isOnline, null);
}
