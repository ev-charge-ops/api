import { NotImplementedException } from '@nestjs/common';
import {
  ChargerGateway,
  type ConnectedVehicle,
  type StartedCharging,
  type Telemetry,
} from '../charger-gateway.port.js';

export class SemsChargerGateway extends ChargerGateway {
  readonly timeScale = 1;

  connectedVehicle(): Promise<ConnectedVehicle | null> {
    return Promise.resolve(null);
  }

  start(): Promise<StartedCharging> {
    return Promise.reject(notImplemented());
  }

  stop(): Promise<void> {
    return Promise.reject(notImplemented());
  }

  readTelemetry(): Promise<Telemetry> {
    return Promise.reject(notImplemented());
  }

  projectCompletion(): Date | null {
    return null;
  }
}

function notImplemented(): NotImplementedException {
  return new NotImplementedException(
    'GoodWe SEMS integration is not available yet',
  );
}
