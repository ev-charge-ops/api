import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import {
  AnomalyScorer,
  DisabledAnomalyScorer,
} from './anomaly/anomaly-scorer.port.js';
import { MlAnomalyScorer } from './anomaly/ml-anomaly-scorer.js';
import { DemandFactorProvider } from './demand-factor/demand-factor.provider.js';
import { MlDemandFactorProvider } from './demand-factor/ml-demand-factor.provider.js';
import { RuleDemandFactorProvider } from './demand-factor/rule-demand-factor.provider.js';
import { MlHttpClient } from './ml/ml-http-client.js';

export function createMlClient(
  config: ConfigService<Env, true>,
): MlHttpClient | null {
  const baseUrl = config.get('ML_URL', { infer: true });
  return baseUrl ? new MlHttpClient({ baseUrl }) : null;
}

export function createDemandFactorProvider(
  config: ConfigService<Env, true>,
): DemandFactorProvider {
  const rules = new RuleDemandFactorProvider();
  const client = createMlClient(config);
  return client ? new MlDemandFactorProvider(client, rules) : rules;
}

export function createAnomalyScorer(
  config: ConfigService<Env, true>,
): AnomalyScorer {
  const client = createMlClient(config);
  return client ? new MlAnomalyScorer(client) : new DisabledAnomalyScorer();
}

@Module({
  providers: [
    {
      provide: DemandFactorProvider,
      inject: [ConfigService],
      useFactory: createDemandFactorProvider,
    },
    {
      provide: AnomalyScorer,
      inject: [ConfigService],
      useFactory: createAnomalyScorer,
    },
  ],
  exports: [DemandFactorProvider, AnomalyScorer],
})
export class IntelligenceModule {}
