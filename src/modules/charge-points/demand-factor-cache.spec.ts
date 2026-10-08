import type {
  DemandFactor,
  DemandFactorInput,
  DemandFactorProvider,
} from '../intelligence/demand-factor/demand-factor.provider.js';
import { DemandFactorCache } from './demand-factor-cache.js';

const MODEL: DemandFactor = {
  factor: 1.2,
  level: 'NORMAL',
  source: 'MODEL',
  modelVersion: 'demand-1',
};

const RULE: DemandFactor = {
  factor: 1.5,
  level: 'PEAK',
  source: 'RULE',
  modelVersion: null,
};

function input(at: string, occupancyRatio = 0): DemandFactorInput {
  return {
    at: new Date(at),
    chargePointType: 'COMMERCIAL',
    occupancyRatio,
    queueLength: 0,
  };
}

function cacheWith(...results: DemandFactor[]) {
  const getFactor = vi.fn();
  for (const result of results) {
    getFactor.mockResolvedValueOnce(result);
  }
  const cache = new DemandFactorCache({
    getFactor,
  } as unknown as DemandFactorProvider);
  return { cache, getFactor };
}

describe('DemandFactorCache', () => {
  it('reuses the model factor of an organization within the same hour', async () => {
    const { cache, getFactor } = cacheWith(MODEL, { ...MODEL, factor: 0.9 });

    expect(await cache.get('org-1', input('2026-10-07T19:05:00-03:00'))).toBe(
      MODEL,
    );
    expect(
      await cache.get('org-1', input('2026-10-07T19:55:00-03:00', 1)),
    ).toBe(MODEL);
    expect(getFactor).toHaveBeenCalledTimes(1);

    expect(
      await cache.get('org-1', input('2026-10-07T20:00:00-03:00')),
    ).toMatchObject({ factor: 0.9 });
    expect(getFactor).toHaveBeenCalledTimes(2);
  });

  it('keeps organizations and point types apart', async () => {
    const { cache, getFactor } = cacheWith(MODEL, MODEL, MODEL);
    const at = '2026-10-07T19:05:00-03:00';

    await cache.get('org-1', input(at));
    await cache.get('org-2', input(at));
    await cache.get('org-1', { ...input(at), chargePointType: 'PRIVATE' });

    expect(getFactor).toHaveBeenCalledTimes(3);
  });

  it('does not cache the rule fallback', async () => {
    const { cache, getFactor } = cacheWith(RULE, RULE);
    const at = '2026-10-07T19:05:00-03:00';

    await cache.get('org-1', input(at));
    await cache.get('org-1', input(at));

    expect(getFactor).toHaveBeenCalledTimes(2);
    expect(cache.peek('org-1', 'COMMERCIAL', new Date(at))).toBeNull();
  });

  it('peeks the cached factor without calling the model', async () => {
    const { cache, getFactor } = cacheWith(MODEL);
    const at = new Date('2026-10-07T19:05:00-03:00');

    expect(cache.peek('org-1', 'COMMERCIAL', at)).toBeNull();
    await cache.get('org-1', input(at.toISOString()));

    expect(cache.peek('org-1', 'COMMERCIAL', at)).toBe(MODEL);
    expect(getFactor).toHaveBeenCalledTimes(1);
  });
});
