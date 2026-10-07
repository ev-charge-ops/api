import {
  ChargerGateway,
  type ChargingProfile,
  type ConnectedVehicle,
  type StartChargingRequest,
  type StartedCharging,
  type Telemetry,
  type TelemetrySample,
  type TelemetryWindow,
} from '../charger-gateway.port.js';

export const MOCK_VEHICLE: ConnectedVehicle = {
  batteryCapacityWh: 50_000,
  socPercent: 42,
};

export const SAMPLE_INTERVAL_MINUTES = 5;
const TAPER_START_SOC = 80;
const TAPER_FLOOR = 0.3;
const MINUTE_IN_MS = 60_000;

interface Checkpoint {
  minute: number;
  energyWh: number;
  powerKw: number;
}

interface Simulation {
  checkpoints: Checkpoint[];
  current: Checkpoint;
  completedMinute: number | null;
}

export class MockChargerGateway extends ChargerGateway {
  constructor(readonly timeScale: number) {
    super();
  }

  start(request: StartChargingRequest): Promise<StartedCharging> {
    return Promise.resolve({
      transactionId: `mock-${request.sessionId}`,
      vehicle: { ...MOCK_VEHICLE },
    });
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  readTelemetry(
    profile: ChargingProfile,
    window: TelemetryWindow,
  ): Promise<Telemetry> {
    return Promise.resolve(mockTelemetry(profile, window));
  }
}

export function mockTelemetry(
  profile: ChargingProfile,
  window: TelemetryWindow,
): Telemetry {
  const realMsPerMinute = MINUTE_IN_MS / profile.timeScale;
  const toDate = (minute: number) =>
    new Date(
      profile.startedAt.getTime() + Math.round(minute * realMsPerMinute),
    );
  const elapsedMinutes = Math.max(
    0,
    (window.until.getTime() - profile.startedAt.getTime()) / realMsPerMinute,
  );
  const simulation = simulate(profile, elapsedMinutes);
  const sample = (checkpoint: Checkpoint, at: Date): TelemetrySample => ({
    at,
    energyWh: Math.round(checkpoint.energyWh),
    powerKw: round2(checkpoint.powerKw),
    socPercent: socPercent(profile, checkpoint.energyWh),
  });

  const samples = simulation.checkpoints
    .map((checkpoint) => sample(checkpoint, toDate(checkpoint.minute)))
    .filter((item) => item.at.getTime() > window.since.getTime());
  const completedAt =
    simulation.completedMinute === null
      ? null
      : toDate(simulation.completedMinute);

  return {
    current: sample(simulation.current, window.until),
    samples,
    completedAt,
  };
}

function simulate(
  profile: ChargingProfile,
  elapsedMinutes: number,
): Simulation {
  const checkpoints: Checkpoint[] = [];
  let energyWh = 0;
  let minute = 0;

  if (profile.targetEnergyWh <= 0) {
    const done = { minute: 0, energyWh: 0, powerKw: 0 };
    return { checkpoints: [done], current: done, completedMinute: 0 };
  }

  while (minute < elapsedMinutes) {
    const powerKw = powerAt(profile, energyWh);
    const whPerMinute = (powerKw * 1000) / 60;
    const step = Math.min(1, elapsedMinutes - minute);
    const remainingWh = profile.targetEnergyWh - energyWh;
    if (whPerMinute * step >= remainingWh) {
      const completedMinute = minute + remainingWh / whPerMinute;
      const done = {
        minute: completedMinute,
        energyWh: profile.targetEnergyWh,
        powerKw: 0,
      };
      checkpoints.push(done);
      return { checkpoints, current: done, completedMinute };
    }
    energyWh += whPerMinute * step;
    minute += step;
    if (step === 1 && minute % SAMPLE_INTERVAL_MINUTES === 0) {
      checkpoints.push({
        minute,
        energyWh,
        powerKw: powerAt(profile, energyWh),
      });
    }
  }

  return {
    checkpoints,
    current: { minute, energyWh, powerKw: powerAt(profile, energyWh) },
    completedMinute: null,
  };
}

function powerAt(profile: ChargingProfile, energyWh: number): number {
  const soc =
    profile.initialSocPercent + (energyWh / profile.batteryCapacityWh) * 100;
  if (soc < TAPER_START_SOC) {
    return profile.allocatedPowerKw;
  }
  const taper =
    1 - ((soc - TAPER_START_SOC) / (100 - TAPER_START_SOC)) * (1 - TAPER_FLOOR);
  return profile.allocatedPowerKw * Math.max(TAPER_FLOOR, taper);
}

function socPercent(profile: ChargingProfile, energyWh: number): number {
  return Math.min(
    100,
    Math.round(
      profile.initialSocPercent + (energyWh / profile.batteryCapacityWh) * 100,
    ),
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
