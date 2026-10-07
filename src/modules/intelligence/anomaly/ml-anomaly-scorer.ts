import { Logger } from '@nestjs/common';
import { isRecord, type MlHttpClient } from '../ml/ml-http-client.js';
import {
  type AnomalyScore,
  AnomalyScorer,
  type SessionFeatures,
} from './anomaly-scorer.port.js';

export class MlAnomalyScorer extends AnomalyScorer {
  private readonly logger = new Logger(MlAnomalyScorer.name);

  constructor(private readonly client: MlHttpClient) {
    super();
  }

  async score(features: SessionFeatures): Promise<AnomalyScore | null> {
    try {
      const body = await this.client.post('/anomaly-score', features);
      if (
        !isRecord(body) ||
        typeof body.score !== 'number' ||
        !Number.isFinite(body.score) ||
        typeof body.isAnomaly !== 'boolean'
      ) {
        throw new Error('unexpected anomaly score payload');
      }
      return {
        score: Math.round(body.score * 10_000) / 10_000,
        isAnomaly: body.isAnomaly,
        modelVersion:
          typeof body.modelVersion === 'string' ? body.modelVersion : null,
      };
    } catch (error) {
      this.logger.warn(`Session left without anomaly score: ${String(error)}`);
      return null;
    }
  }
}
