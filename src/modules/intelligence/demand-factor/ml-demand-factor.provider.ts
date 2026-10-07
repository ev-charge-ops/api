import { Logger } from '@nestjs/common';
import { toSaoPauloTime } from '../../../common/time/sao-paulo-time.js';
import { isRecord, type MlHttpClient } from '../ml/ml-http-client.js';
import {
  type DemandFactor,
  type DemandFactorInput,
  DemandFactorProvider,
  DemandFactorSource,
  DemandLevel,
} from './demand-factor.provider.js';

export const MIN_MODEL_FACTOR = 0.5;
export const MAX_MODEL_FACTOR = 3;
const OFF_PEAK_BELOW = 0.95;
const PEAK_ABOVE = 1.2;

export function demandLevelOf(factor: number): DemandLevel {
  if (factor < OFF_PEAK_BELOW) {
    return DemandLevel.OFF_PEAK;
  }
  if (factor > PEAK_ABOVE) {
    return DemandLevel.PEAK;
  }
  return DemandLevel.NORMAL;
}

export class MlDemandFactorProvider extends DemandFactorProvider {
  private readonly logger = new Logger(MlDemandFactorProvider.name);

  constructor(
    private readonly client: MlHttpClient,
    private readonly fallback: DemandFactorProvider,
  ) {
    super();
  }

  async getFactor(input: DemandFactorInput): Promise<DemandFactor> {
    const local = toSaoPauloTime(input.at);
    try {
      const body = await this.client.post('/demand-factor', {
        hour: local.hour,
        dayOfWeek: local.dayOfWeek,
        occupancyRatio: input.occupancyRatio,
        queueLength: input.queueLength,
        chargePointType: input.chargePointType,
      });
      const factor = isRecord(body) ? body.factor : undefined;
      const modelVersion = isRecord(body) ? body.modelVersion : undefined;
      if (
        typeof factor !== 'number' ||
        !Number.isFinite(factor) ||
        factor < MIN_MODEL_FACTOR ||
        factor > MAX_MODEL_FACTOR
      ) {
        throw new Error(`unusable factor ${JSON.stringify(factor)}`);
      }
      const rounded = Math.round(factor * 100) / 100;
      return {
        factor: rounded,
        level: demandLevelOf(rounded),
        source: DemandFactorSource.MODEL,
        modelVersion: typeof modelVersion === 'string' ? modelVersion : null,
      };
    } catch (error) {
      this.logger.warn(
        `Falling back to the rule demand factor: ${String(error)}`,
      );
      return this.fallback.getFactor(input);
    }
  }
}
