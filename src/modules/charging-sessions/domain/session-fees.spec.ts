import {
  addSessionMinutes,
  energyCostCents,
  idleFeeCents,
  sessionMinutesBetween,
} from './session-fees.js';
import {
  energyToFullWh,
  energyToSocWh,
  isReachableSoc,
  targetEnergyWh,
} from './charging-limit.js';

describe('energyCostCents', () => {
  it('prices energy in whole cents', () => {
    expect(energyCostCents(11_760, 89)).toBe(1047);
    expect(energyCostCents(29_000, 284)).toBe(8236);
    expect(energyCostCents(0, 89)).toBe(0);
  });

  it('rounds half a cent up', () => {
    expect(energyCostCents(500, 89)).toBe(45);
  });
});

describe('idleFeeCents', () => {
  it('charges per idle minute', () => {
    expect(idleFeeCents(6, 25, 3000)).toBe(150);
  });

  it('stops at the cap', () => {
    expect(idleFeeCents(119, 25, 3000)).toBe(2975);
    expect(idleFeeCents(120, 25, 3000)).toBe(3000);
    expect(idleFeeCents(500, 25, 3000)).toBe(3000);
  });

  it('never goes negative', () => {
    expect(idleFeeCents(-3, 25, 3000)).toBe(0);
  });
});

describe('session time', () => {
  const from = new Date('2026-10-07T22:00:00Z');

  it('counts whole simulated minutes', () => {
    expect(
      sessionMinutesBetween(from, new Date('2026-10-07T22:05:59Z'), 1),
    ).toBe(5);
    expect(
      sessionMinutesBetween(from, new Date('2026-10-07T22:00:10Z'), 60),
    ).toBe(10);
    expect(
      sessionMinutesBetween(from, new Date('2026-10-07T21:00:00Z'), 1),
    ).toBe(0);
  });

  it('adds simulated minutes in real time', () => {
    expect(addSessionMinutes(from, 10, 60)).toEqual(
      new Date('2026-10-07T22:00:10Z'),
    );
  });
});

describe('targetEnergyWh', () => {
  const vehicle = { batteryCapacityWh: 50_000, socPercent: 42 };

  it('fills the 29 kWh missing to 100%', () => {
    expect(energyToFullWh(vehicle)).toBe(29_000);
    expect(targetEnergyWh({ type: 'FULL' }, vehicle, 89)).toBe(29_000);
  });

  it('honours an energy limit below full', () => {
    expect(
      targetEnergyWh({ type: 'ENERGY', energyWh: 10_000 }, vehicle, 89),
    ).toBe(10_000);
    expect(
      targetEnergyWh({ type: 'ENERGY', energyWh: 40_000 }, vehicle, 89),
    ).toBe(29_000);
  });

  it('converts an amount into energy at the locked rate', () => {
    expect(
      targetEnergyWh({ type: 'AMOUNT', amountCents: 2000 }, vehicle, 284),
    ).toBe(7042);
    expect(
      targetEnergyWh({ type: 'AMOUNT', amountCents: 100_000 }, vehicle, 89),
    ).toBe(29_000);
  });

  it('charges up to the target state of charge of a percent limit', () => {
    expect(
      targetEnergyWh({ type: 'PERCENT', socPercent: 80 }, vehicle, 89),
    ).toBe(19_000);
    expect(
      targetEnergyWh({ type: 'PERCENT', socPercent: 100 }, vehicle, 89),
    ).toBe(29_000);
    expect(
      targetEnergyWh({ type: 'PERCENT', socPercent: 42 }, vehicle, 89),
    ).toBe(0);
    expect(
      energyToSocWh({ batteryCapacityWh: 64_000, socPercent: 17 }, 63),
    ).toBe(29_440);
  });

  it('only reaches a state of charge above the current one', () => {
    expect(isReachableSoc(vehicle, 43)).toBe(true);
    expect(isReachableSoc(vehicle, 42)).toBe(false);
    expect(isReachableSoc(vehicle, 30)).toBe(false);
  });
});
