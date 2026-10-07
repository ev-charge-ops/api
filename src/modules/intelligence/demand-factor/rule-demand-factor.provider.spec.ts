import type { DemandFactorInput } from './demand-factor.provider.js';
import { RuleDemandFactorProvider } from './rule-demand-factor.provider.js';

function input(
  localHour: string,
  overrides: Partial<DemandFactorInput> = {},
): DemandFactorInput {
  return {
    at: new Date(`2026-10-07T${localHour}:00-03:00`),
    chargePointType: 'COMMERCIAL',
    occupancyRatio: 0,
    queueLength: 0,
    ...overrides,
  };
}

describe('RuleDemandFactorProvider', () => {
  const provider = new RuleDemandFactorProvider();

  it.each([
    ['02:00', 0.8, 'OFF_PEAK'],
    ['23:30', 0.8, 'OFF_PEAK'],
    ['10:00', 1, 'NORMAL'],
    ['21:15', 1, 'NORMAL'],
    ['18:00', 1.5, 'PEAK'],
    ['20:59', 1.5, 'PEAK'],
  ])('prices %s at %sx (%s)', async (hour, factor, level) => {
    await expect(provider.getFactor(input(hour))).resolves.toEqual({
      factor,
      level,
      source: 'RULE',
      modelVersion: null,
    });
  });

  it('treats a crowded site as peak at any hour', async () => {
    const result = await provider.getFactor(
      input('10:00', { occupancyRatio: 0.8 }),
    );
    expect(result.factor).toBe(1.5);
  });

  it('treats a queue as peak', async () => {
    const result = await provider.getFactor(input('03:00', { queueLength: 2 }));
    expect(result.level).toBe('PEAK');
  });

  it('keeps the night at normal price when the site is half full', async () => {
    const result = await provider.getFactor(
      input('23:00', { occupancyRatio: 0.5 }),
    );
    expect(result.level).toBe('NORMAL');
  });
});
