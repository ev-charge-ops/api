import { Injectable } from '@nestjs/common';
import {
  ChargerGateway,
  type ChargingProfile,
} from '../charger-gateway/charger-gateway.port.js';
import type {
  ChargingSession,
  SessionTimeline,
} from './domain/charging-session.entity.js';
import { SessionStatus } from './domain/session-status.js';

export function chargingProfileOf(session: ChargingSession): ChargingProfile {
  const props = session.toProps();
  return {
    chargerSerialNumber: props.chargerSerialNumber,
    transactionId: props.externalTransactionId ?? '',
    startedAt: props.startedAt,
    allocatedPowerKw: props.allocatedPowerKw,
    targetEnergyWh: props.targetEnergyWh ?? 0,
    batteryCapacityWh: props.batteryCapacityWh ?? 0,
    initialSocPercent: props.initialSocPercent ?? 0,
    timeScale: props.timeScale,
  };
}

@Injectable()
export class SessionProjector {
  constructor(private readonly gateway: ChargerGateway) {}

  timelineOf(session: ChargingSession): SessionTimeline {
    return session.projectTimeline(
      session.status === SessionStatus.ACTIVE
        ? this.projectedChargingEnd(session)
        : null,
    );
  }

  isProjectable(session: ChargingSession): boolean {
    return this.projectedChargingEnd(session) !== null;
  }

  private projectedChargingEnd(session: ChargingSession): Date | null {
    return this.gateway.projectCompletion(chargingProfileOf(session));
  }
}
