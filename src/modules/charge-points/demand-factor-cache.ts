import { Injectable } from '@nestjs/common';
import { LruCache } from '../../common/cache/lru-cache.js';
import type { ChargePointType } from '../../generated/prisma/enums.js';
import {
  type DemandFactor,
  type DemandFactorInput,
  DemandFactorProvider,
  DemandFactorSource,
} from '../intelligence/demand-factor/demand-factor.provider.js';

export const DEMAND_FACTOR_CACHE_SIZE = 5000;

const HOUR_IN_MS = 3_600_000;

@Injectable()
export class DemandFactorCache {
  private readonly entries = new LruCache<string, DemandFactor>(
    DEMAND_FACTOR_CACHE_SIZE,
  );

  constructor(private readonly provider: DemandFactorProvider) {}

  async get(
    organizationId: string,
    input: DemandFactorInput,
  ): Promise<DemandFactor> {
    const key = cacheKey(organizationId, input.chargePointType, input.at);
    const cached = this.entries.get(key);
    if (cached) {
      return cached;
    }
    const demand = await this.provider.getFactor(input);
    if (demand.source === DemandFactorSource.MODEL) {
      this.entries.set(key, demand);
    }
    return demand;
  }

  peek(
    organizationId: string,
    type: ChargePointType,
    at: Date,
  ): DemandFactor | null {
    return this.entries.peek(cacheKey(organizationId, type, at)) ?? null;
  }
}

function cacheKey(
  organizationId: string,
  type: ChargePointType,
  at: Date,
): string {
  return `${organizationId}:${type}:${Math.floor(at.getTime() / HOUR_IN_MS)}`;
}
