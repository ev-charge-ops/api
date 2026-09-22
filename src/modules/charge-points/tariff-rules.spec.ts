import {
  DEFAULT_TARIFF_TERMS,
  effectiveTariff,
  pricePerKwhCents,
} from './tariff-rules.js';

describe('pricePerKwhCents', () => {
  it('passes the utility rate through on private points, ignoring demand', () => {
    expect(pricePerKwhCents('PRIVATE', DEFAULT_TARIFF_TERMS, 1.5)).toBe(89);
  });

  it('applies the demand factor to the commercial base rate', () => {
    expect(pricePerKwhCents('COMMERCIAL', DEFAULT_TARIFF_TERMS, 1.5)).toBe(284);
    expect(pricePerKwhCents('COMMERCIAL', DEFAULT_TARIFF_TERMS, 0.8)).toBe(151);
    expect(pricePerKwhCents('COMMERCIAL', DEFAULT_TARIFF_TERMS, 1)).toBe(189);
  });

  it('falls back to the utility rate when no base rate is set', () => {
    expect(
      pricePerKwhCents(
        'COMMERCIAL',
        { utilityRateCents: 100, baseRateCents: null },
        1.5,
      ),
    ).toBe(150);
  });
});

describe('effectiveTariff', () => {
  const at = new Date('2026-10-07T12:00:00Z');
  const tariffs = [
    { id: 'org-old', chargePointId: null, validFrom: new Date('2026-01-01') },
    { id: 'org-new', chargePointId: null, validFrom: new Date('2026-09-01') },
    {
      id: 'org-future',
      chargePointId: null,
      validFrom: new Date('2026-11-01'),
    },
    { id: 'point', chargePointId: 'p1', validFrom: new Date('2026-02-01') },
  ];

  it('prefers the latest valid tariff of the charge point', () => {
    expect(effectiveTariff(tariffs, 'p1', at)?.id).toBe('point');
  });

  it('falls back to the latest valid organization tariff', () => {
    expect(effectiveTariff(tariffs, 'p2', at)?.id).toBe('org-new');
  });

  it('ignores tariffs that are not valid yet', () => {
    expect(effectiveTariff(tariffs, 'p2', new Date('2026-03-01'))?.id).toBe(
      'org-old',
    );
    expect(effectiveTariff(tariffs, 'p2', new Date('2025-01-01'))).toBeNull();
  });
});
