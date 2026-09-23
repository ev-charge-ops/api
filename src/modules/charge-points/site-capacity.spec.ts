import { allocatePowerKw, chargingHeadroomKw } from './site-capacity.js';

const capacity = {
  contractedDemandKw: 75,
  commonAreaReserveKw: 11.5,
  minChargingPowerKw: 3.7,
};

describe('chargingHeadroomKw', () => {
  it('keeps the common area reserve out of the balancing', () => {
    expect(chargingHeadroomKw(capacity, 14)).toBe(49.5);
  });
});

describe('allocatePowerKw', () => {
  it('gives the full point power when the building has room', () => {
    expect(
      allocatePowerKw({ maxPowerKw: 22, capacity, activeSessionsKw: 14 }),
    ).toBe(22);
  });

  it('throttles the point to the remaining headroom', () => {
    expect(
      allocatePowerKw({ maxPowerKw: 22, capacity, activeSessionsKw: 48 }),
    ).toBe(15.5);
  });

  it('refuses to start below the minimum charging power', () => {
    expect(
      allocatePowerKw({ maxPowerKw: 7, capacity, activeSessionsKw: 60 }),
    ).toBeNull();
  });

  it('uses the point power when the site has no capacity data', () => {
    expect(
      allocatePowerKw({ maxPowerKw: 7, capacity: null, activeSessionsKw: 99 }),
    ).toBe(7);
  });
});
