import type { ChargingProfile } from '../charger-gateway.port.js';
import {
  MOCK_VEHICLE,
  MockChargerGateway,
  mockTelemetry,
  projectedCompletion,
} from './mock-charger.adapter.js';

const STARTED_AT = new Date('2026-10-07T22:00:00.000Z');

function profile(overrides: Partial<ChargingProfile> = {}): ChargingProfile {
  return {
    chargerSerialNumber: 'GW-1',
    transactionId: 'mock-1',
    startedAt: STARTED_AT,
    allocatedPowerKw: 7,
    targetEnergyWh: 29_000,
    batteryCapacityWh: MOCK_VEHICLE.batteryCapacityWh,
    initialSocPercent: MOCK_VEHICLE.socPercent,
    timeScale: 1,
    ...overrides,
  };
}

function minutesAfterStart(minutes: number, timeScale = 1): Date {
  return new Date(STARTED_AT.getTime() + (minutes * 60_000) / timeScale);
}

describe('mockTelemetry', () => {
  it('charges at the allocated power before the taper', () => {
    const telemetry = mockTelemetry(profile(), {
      since: STARTED_AT,
      until: minutesAfterStart(60),
    });

    expect(telemetry.completedAt).toBeNull();
    expect(telemetry.current).toEqual({
      at: minutesAfterStart(60),
      energyWh: 7000,
      powerKw: 7,
      socPercent: 56,
    });
    expect(telemetry.samples.map((sample) => sample.energyWh)).toEqual(
      Array.from({ length: 12 }, (_, index) =>
        Math.round(((index + 1) * 5 * 7000) / 60),
      ),
    );
  });

  it('tapers above 80% and fills the 29 kWh from 42% to 100%', () => {
    const telemetry = mockTelemetry(profile(), {
      since: STARTED_AT,
      until: minutesAfterStart(600),
    });

    expect(telemetry.completedAt).not.toBeNull();
    const minutesToFull =
      (telemetry.completedAt!.getTime() - STARTED_AT.getTime()) / 60_000;
    expect(minutesToFull).toBeGreaterThan(29_000 / (7000 / 60));
    expect(minutesToFull).toBeLessThan(330);
    expect(telemetry.current).toMatchObject({
      energyWh: 29_000,
      powerKw: 0,
      socPercent: 100,
    });
    const lastSample = telemetry.samples.at(-1)!;
    expect(lastSample.at).toEqual(telemetry.completedAt);
    const tapering = telemetry.samples.find(
      (sample) => sample.socPercent >= 90,
    );
    expect(tapering!.powerKw).toBeLessThan(7);
  });

  it('stops at the requested energy', () => {
    const telemetry = mockTelemetry(profile({ targetEnergyWh: 3500 }), {
      since: STARTED_AT,
      until: minutesAfterStart(60),
    });

    expect(telemetry.completedAt).toEqual(minutesAfterStart(30));
    expect(telemetry.current.energyWh).toBe(3500);
  });

  it('only returns samples after the given instant', () => {
    const telemetry = mockTelemetry(profile(), {
      since: minutesAfterStart(20),
      until: minutesAfterStart(31),
    });

    expect(telemetry.samples.map((sample) => sample.at)).toEqual([
      minutesAfterStart(25),
      minutesAfterStart(30),
    ]);
    expect(telemetry.current.at).toEqual(minutesAfterStart(31));
  });

  it('accelerates simulated time by the time scale', () => {
    const telemetry = mockTelemetry(profile({ timeScale: 60 }), {
      since: STARTED_AT,
      until: minutesAfterStart(60, 60),
    });

    expect(telemetry.current.energyWh).toBe(7000);
  });

  it('reports nothing before the session starts', () => {
    const telemetry = mockTelemetry(profile(), {
      since: STARTED_AT,
      until: STARTED_AT,
    });

    expect(telemetry.samples).toEqual([]);
    expect(telemetry.current).toMatchObject({ energyWh: 0, socPercent: 42 });
  });
});

describe('projectedCompletion', () => {
  it.each([
    ['a full charge with the taper', profile()],
    ['an energy limit', profile({ targetEnergyWh: 3500 })],
    ['an accelerated simulation', profile({ timeScale: 60 })],
    ['a lower allocated power', profile({ allocatedPowerKw: 3.7 })],
  ])('matches the completion the telemetry reports for %s', (_, charging) => {
    const projected = projectedCompletion(charging);
    const { completedAt } = mockTelemetry(charging, {
      since: STARTED_AT,
      until: minutesAfterStart(2000, charging.timeScale),
    });

    expect(projected).not.toBeNull();
    expect(projected).toEqual(completedAt);
  });

  it('projects the energy limit before charging starts to report it', () => {
    expect(projectedCompletion(profile({ targetEnergyWh: 3500 }))).toEqual(
      minutesAfterStart(30),
    );
  });

  it('cannot project a charger that delivers no power', () => {
    expect(projectedCompletion(profile({ allocatedPowerKw: 0 }))).toBeNull();
    expect(projectedCompletion(profile({ batteryCapacityWh: 0 }))).toBeNull();
  });

  it('completes at the start when there is nothing to charge', () => {
    expect(projectedCompletion(profile({ targetEnergyWh: 0 }))).toEqual(
      STARTED_AT,
    );
  });
});

describe('MockChargerGateway', () => {
  it('starts with the simulated vehicle and a transaction id', async () => {
    const gateway = new MockChargerGateway(60);

    await expect(
      gateway.start({
        sessionId: 'session-1',
        chargerSerialNumber: 'GW-1',
        allocatedPowerKw: 7,
      }),
    ).resolves.toEqual({
      transactionId: 'mock-session-1',
      vehicle: { batteryCapacityWh: 50_000, socPercent: 42 },
    });
    expect(gateway.timeScale).toBe(60);
  });

  it('projects the completion of a charging profile', () => {
    expect(
      new MockChargerGateway(60).projectCompletion(
        profile({ targetEnergyWh: 3500, timeScale: 60 }),
      ),
    ).toEqual(minutesAfterStart(30, 60));
  });
});
