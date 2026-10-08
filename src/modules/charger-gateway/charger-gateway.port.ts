export interface StartChargingRequest {
  sessionId: string;
  chargerSerialNumber: string;
  allocatedPowerKw: number;
}

export interface ConnectedVehicle {
  batteryCapacityWh: number;
  socPercent: number;
}

export interface StartedCharging {
  transactionId: string;
  vehicle: ConnectedVehicle;
}

export interface StopChargingRequest {
  chargerSerialNumber: string;
  transactionId: string;
}

export interface ChargingProfile {
  chargerSerialNumber: string;
  transactionId: string;
  startedAt: Date;
  allocatedPowerKw: number;
  targetEnergyWh: number;
  batteryCapacityWh: number;
  initialSocPercent: number;
  timeScale: number;
}

export interface TelemetrySample {
  at: Date;
  energyWh: number;
  powerKw: number;
  socPercent: number;
}

export interface TelemetryWindow {
  since: Date;
  until: Date;
}

export interface Telemetry {
  current: TelemetrySample;
  samples: TelemetrySample[];
  completedAt: Date | null;
}

export abstract class ChargerGateway {
  abstract readonly timeScale: number;

  abstract connectedVehicle(
    chargerSerialNumber: string,
  ): Promise<ConnectedVehicle | null>;

  abstract start(request: StartChargingRequest): Promise<StartedCharging>;

  abstract stop(request: StopChargingRequest): Promise<void>;

  abstract readTelemetry(
    profile: ChargingProfile,
    window: TelemetryWindow,
  ): Promise<Telemetry>;

  abstract projectCompletion(profile: ChargingProfile): Date | null;
}
