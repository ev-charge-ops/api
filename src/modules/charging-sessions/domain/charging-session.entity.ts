import {
  type ChargingLimit,
  targetEnergyWh,
  type Vehicle,
} from './charging-limit.js';
import {
  addSessionMinutes,
  energyCostCents,
  idleFeeCents,
  sessionMinutesBetween,
} from './session-fees.js';
import { isOpenStatus, SessionStatus } from './session-status.js';

export type Regime = 'PRIVATE' | 'COMMERCIAL';
export type DemandSource = 'RULE' | 'MODEL';

export interface MeterSample {
  at: Date;
  energyWh: number;
  powerKw: number;
  socPercent: number | null;
}

export interface ChargingSessionProps {
  id: string;
  userId: string;
  chargePointId: string;
  chargePointCode: string;
  chargePointName: string;
  chargerSerialNumber: string;
  organizationId: string;
  unitLabel: string | null;
  regime: Regime;
  status: SessionStatus;
  limit: ChargingLimit;
  targetEnergyWh: number | null;
  allocatedPowerKw: number;
  batteryCapacityWh: number | null;
  initialSocPercent: number | null;
  timeScale: number;
  lockedRateCents: number;
  demandFactor: number;
  demandFactorSource: DemandSource;
  idleFeeCentsPerMinute: number;
  idleFeeCapCents: number;
  gracePeriodMinutes: number;
  externalTransactionId: string | null;
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  telemetryReadAt: Date | null;
  energyWh: number;
  powerKw: number;
  socPercent: number | null;
  energyCostCents: number;
  idleMinutes: number;
  idleFeeCents: number;
  totalCents: number;
  anomalyScore: number | null;
  version: Date | null;
}

export type NewChargingSession = Pick<
  ChargingSessionProps,
  | 'id'
  | 'userId'
  | 'chargePointId'
  | 'chargePointCode'
  | 'chargePointName'
  | 'chargerSerialNumber'
  | 'organizationId'
  | 'unitLabel'
  | 'regime'
  | 'limit'
  | 'allocatedPowerKw'
  | 'timeScale'
  | 'lockedRateCents'
  | 'demandFactor'
  | 'demandFactorSource'
  | 'idleFeeCentsPerMinute'
  | 'idleFeeCapCents'
  | 'gracePeriodMinutes'
  | 'startedAt'
>;

export class SessionAlreadyEndedError extends Error {
  override readonly name = 'SessionAlreadyEndedError';
}

export class InvalidSessionTransitionError extends Error {
  override readonly name = 'InvalidSessionTransitionError';
}

export class ChargingSession {
  private constructor(private props: ChargingSessionProps) {}

  static create(data: NewChargingSession): ChargingSession {
    return new ChargingSession({
      ...data,
      status: SessionStatus.PENDING,
      targetEnergyWh: null,
      batteryCapacityWh: null,
      initialSocPercent: null,
      externalTransactionId: null,
      chargingEndedAt: null,
      endedAt: null,
      telemetryReadAt: null,
      energyWh: 0,
      powerKw: 0,
      socPercent: null,
      energyCostCents: 0,
      idleMinutes: 0,
      idleFeeCents: 0,
      totalCents: 0,
      anomalyScore: null,
      version: null,
    });
  }

  static restore(props: ChargingSessionProps): ChargingSession {
    return new ChargingSession({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get status(): SessionStatus {
    return this.props.status;
  }

  get isOpen(): boolean {
    return isOpenStatus(this.props.status);
  }

  get graceEndsAt(): Date | null {
    const { chargingEndedAt, gracePeriodMinutes, timeScale } = this.props;
    if (!chargingEndedAt) {
      return null;
    }
    return addSessionMinutes(chargingEndedAt, gracePeriodMinutes, timeScale);
  }

  toProps(): ChargingSessionProps {
    return { ...this.props };
  }

  markPersisted(version: Date): void {
    this.props.version = version;
  }

  activate(transactionId: string, vehicle: Vehicle): void {
    this.expectStatus(SessionStatus.PENDING);
    this.props.status = SessionStatus.ACTIVE;
    this.props.externalTransactionId = transactionId;
    this.props.batteryCapacityWh = vehicle.batteryCapacityWh;
    this.props.initialSocPercent = vehicle.socPercent;
    this.props.socPercent = vehicle.socPercent;
    this.props.powerKw = this.props.allocatedPowerKw;
    this.props.targetEnergyWh = targetEnergyWh(
      this.props.limit,
      vehicle,
      this.props.lockedRateCents,
    );
  }

  interrupt(at: Date): void {
    if (!this.isOpen) {
      throw new SessionAlreadyEndedError('Session has already ended');
    }
    this.props.status = SessionStatus.INTERRUPTED;
    this.props.chargingEndedAt ??= at;
    this.props.endedAt = at;
    this.props.powerKw = 0;
    this.updateTotals();
  }

  recordTelemetry(
    sample: MeterSample,
    completedAt: Date | null,
    readAt: Date,
  ): void {
    if (this.props.status !== SessionStatus.ACTIVE) {
      return;
    }
    this.props.energyWh = sample.energyWh;
    this.props.powerKw = sample.powerKw;
    this.props.socPercent = sample.socPercent;
    this.props.telemetryReadAt = readAt;
    if (completedAt) {
      this.props.chargingEndedAt = completedAt;
      this.props.powerKw = 0;
      this.props.status = SessionStatus.GRACE;
    }
    this.updateTotals();
  }

  advance(now: Date): void {
    const graceEndsAt = this.graceEndsAt;
    const waiting =
      this.props.status === SessionStatus.GRACE ||
      this.props.status === SessionStatus.IDLE;
    if (!waiting || !graceEndsAt) {
      return;
    }
    if (now.getTime() >= graceEndsAt.getTime()) {
      this.props.status = SessionStatus.IDLE;
    }
    this.props.idleMinutes = sessionMinutesBetween(
      graceEndsAt,
      now,
      this.props.timeScale,
    );
    this.props.idleFeeCents = idleFeeCents(
      this.props.idleMinutes,
      this.props.idleFeeCentsPerMinute,
      this.props.idleFeeCapCents,
    );
    this.updateTotals();
  }

  stop(now: Date): void {
    switch (this.props.status) {
      case SessionStatus.PENDING:
        this.interrupt(now);
        return;
      case SessionStatus.ACTIVE:
        this.props.chargingEndedAt = now;
        this.props.powerKw = 0;
        break;
      case SessionStatus.GRACE:
      case SessionStatus.IDLE:
        this.advance(now);
        break;
      default:
        throw new SessionAlreadyEndedError('Session has already ended');
    }
    this.props.status = SessionStatus.CLOSED;
    this.props.endedAt = now;
    this.updateTotals();
  }

  private expectStatus(status: SessionStatus): void {
    if (this.props.status !== status) {
      throw new InvalidSessionTransitionError(
        `Expected a ${status} session but it is ${this.props.status}`,
      );
    }
  }

  private updateTotals(): void {
    this.props.energyCostCents = energyCostCents(
      this.props.energyWh,
      this.props.lockedRateCents,
    );
    this.props.totalCents =
      this.props.energyCostCents + this.props.idleFeeCents;
  }
}
