import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { DisabledAnomalyScorer } from './anomaly/anomaly-scorer.port.js';
import { MlAnomalyScorer } from './anomaly/ml-anomaly-scorer.js';
import { MlDemandFactorProvider } from './demand-factor/ml-demand-factor.provider.js';
import { RuleDemandFactorProvider } from './demand-factor/rule-demand-factor.provider.js';
import {
  createAnomalyScorer,
  createDemandFactorProvider,
} from './intelligence.module.js';

function config(mlUrl: string): ConfigService<Env, true> {
  return { get: () => mlUrl } as unknown as ConfigService<Env, true>;
}

describe('intelligence adapters', () => {
  it('uses only the rules when ML_URL is empty', () => {
    expect(createDemandFactorProvider(config(''))).toBeInstanceOf(
      RuleDemandFactorProvider,
    );
    expect(createAnomalyScorer(config(''))).toBeInstanceOf(
      DisabledAnomalyScorer,
    );
  });

  it('uses the ML service when ML_URL is set', () => {
    const url = 'https://ml.evchargeops.com.br';

    expect(createDemandFactorProvider(config(url))).toBeInstanceOf(
      MlDemandFactorProvider,
    );
    expect(createAnomalyScorer(config(url))).toBeInstanceOf(MlAnomalyScorer);
  });

  it('never scores without the ML service', async () => {
    await expect(new DisabledAnomalyScorer().score()).resolves.toBeNull();
  });
});
