import { toSaoPauloTime } from '../../../common/time/sao-paulo-time.js';
import {
  type DemandFactor,
  type DemandFactorInput,
  DemandFactorProvider,
  DemandFactorSource,
  DemandLevel,
} from './demand-factor.provider.js';

export const DEMAND_FACTORS: Record<DemandLevel, number> = {
  OFF_PEAK: 0.8,
  NORMAL: 1,
  PEAK: 1.5,
};

const PEAK_HOURS = { from: 18, to: 21 };
const OFF_PEAK_HOURS = { from: 22, to: 6 };
const HIGH_OCCUPANCY = 0.8;
const LOW_OCCUPANCY = 0.5;

export function demandLevelFor(input: DemandFactorInput): DemandLevel {
  const { hour } = toSaoPauloTime(input.at);
  const crowded =
    input.occupancyRatio >= HIGH_OCCUPANCY || input.queueLength > 0;
  if (crowded || (hour >= PEAK_HOURS.from && hour < PEAK_HOURS.to)) {
    return DemandLevel.PEAK;
  }
  const offPeakHour = hour >= OFF_PEAK_HOURS.from || hour < OFF_PEAK_HOURS.to;
  if (offPeakHour && input.occupancyRatio < LOW_OCCUPANCY) {
    return DemandLevel.OFF_PEAK;
  }
  return DemandLevel.NORMAL;
}

export class RuleDemandFactorProvider extends DemandFactorProvider {
  getFactor(input: DemandFactorInput): Promise<DemandFactor> {
    return Promise.resolve(ruleDemandFactor(input));
  }
}

export function ruleDemandFactor(input: DemandFactorInput): DemandFactor {
  const level = demandLevelFor(input);
  return {
    factor: DEMAND_FACTORS[level],
    level,
    source: DemandFactorSource.RULE,
    modelVersion: null,
  };
}
