import { chargePointStatus, occupancyRatio } from './charge-point-status.js';

describe('chargePointStatus', () => {
  it.each([
    [true, null, 'AVAILABLE'],
    [true, 'PENDING', 'CHARGING'],
    [true, 'ACTIVE', 'CHARGING'],
    [true, 'GRACE', 'IDLE'],
    [true, 'IDLE', 'IDLE'],
    [false, 'ACTIVE', 'OFFLINE'],
    [false, null, 'OFFLINE'],
  ] as const)('online=%s session=%s is %s', (online, session, expected) => {
    expect(chargePointStatus(online, session)).toBe(expected);
  });
});

describe('occupancyRatio', () => {
  it('counts busy points among the online ones', () => {
    expect(
      occupancyRatio(['CHARGING', 'IDLE', 'AVAILABLE', 'AVAILABLE', 'OFFLINE']),
    ).toBe(0.5);
  });

  it('is zero without online points', () => {
    expect(occupancyRatio(['OFFLINE'])).toBe(0);
    expect(occupancyRatio([])).toBe(0);
  });
});
