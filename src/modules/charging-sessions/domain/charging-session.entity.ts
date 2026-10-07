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
import {
  chargeableEnergyWh,
  PAYMENT_CURRENCY,
  type PaymentSettlement,
  PaymentStatus,
  type SessionPayment,
  settlementFor,
} from './session-payment.js';
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
  demandModelVersion: string | null;
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
  isAnomaly: boolean | null;
  anomalyModelVersion: string | null;
  payment: SessionPayment | null;
  version: Date | null;
}

export interface SessionTimeline {
  chargingEndsAt: Date | null;
  graceEndsAt: Date | null;
  idleStartsAt: Date | null;
  idleFeeCapReachedAt: Date | null;
}

export interface AnomalyResult {
  score: number;
  isAnomaly: boolean;
  modelVersion: string | null;
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
  | 'demandModelVersion'
  | 'idleFeeCentsPerMinute'
  | 'idleFeeCapCents'
  | 'gracePeriodMinutes'
  | 'startedAt'
>;

export interface NewPayment {
  intentId: string;
  customerId: string;
  amountCents: number;
}

const MINUTE_IN_MS = 60_000;

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
      status:
        data.regime === 'COMMERCIAL'
          ? SessionStatus.AWAITING_PAYMENT
          : SessionStatus.PENDING,
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
      isAnomaly: null,
      anomalyModelVersion: null,
      payment: null,
      version: null,
    });
  }

  static restore(props: ChargingSessionProps): ChargingSession {
    return new ChargingSession({
      ...props,
      payment: props.payment ? { ...props.payment } : null,
    });
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

  get requiresPayment(): boolean {
    return this.props.regime === 'COMMERCIAL';
  }

  get payment(): SessionPayment | null {
    return this.props.payment ? { ...this.props.payment } : null;
  }

  get paymentSettlement(): PaymentSettlement | null {
    if (!this.props.payment || this.isOpen) {
      return null;
    }
    return settlementFor(this.props.payment, this.props.totalCents);
  }

  get isOpen(): boolean {
    return isOpenStatus(this.props.status);
  }

  get graceEndsAt(): Date | null {
    return this.graceEndFrom(this.props.chargingEndedAt);
  }

  get idleStartsAt(): Date | null {
    return this.graceEndsAt;
  }

  get idleFeeCapReachedAt(): Date | null {
    return this.idleFeeCapFrom(this.idleStartsAt);
  }

  projectTimeline(projectedChargingEndsAt: Date | null): SessionTimeline {
    const chargingEndsAt = this.timelineChargingEnd(projectedChargingEndsAt);
    const graceEndsAt = this.graceEndFrom(chargingEndsAt);
    return {
      chargingEndsAt,
      graceEndsAt,
      idleStartsAt: graceEndsAt,
      idleFeeCapReachedAt: this.idleFeeCapFrom(graceEndsAt),
    };
  }

  toProps(): ChargingSessionProps {
    return {
      ...this.props,
      payment: this.props.payment ? { ...this.props.payment } : null,
    };
  }

  markPersisted(version: Date): void {
    this.props.version = version;
  }

  activate(transactionId: string, vehicle: Vehicle, at: Date): void {
    this.expectStatus(SessionStatus.PENDING);
    this.props.status = SessionStatus.ACTIVE;
    this.props.startedAt = at;
    this.props.externalTransactionId = transactionId;
    this.props.batteryCapacityWh = vehicle.batteryCapacityWh;
    this.props.initialSocPercent = vehicle.socPercent;
    this.props.socPercent = vehicle.socPercent;
    this.props.powerKw = this.props.allocatedPowerKw;
    this.props.targetEnergyWh = Math.min(
      targetEnergyWh(this.props.limit, vehicle, this.props.lockedRateCents),
      this.payableEnergyWh(),
    );
  }

  attachPayment(payment: NewPayment): void {
    this.expectStatus(SessionStatus.AWAITING_PAYMENT);
    this.props.payment = {
      intentId: payment.intentId,
      customerId: payment.customerId,
      status: PaymentStatus.PENDING_AUTHORIZATION,
      currency: PAYMENT_CURRENCY,
      authorizedCents: payment.amountCents,
      capturedCents: null,
      failureCode: null,
      authorizedAt: null,
      capturedAt: null,
      canceledAt: null,
    };
  }

  recordPaymentAuthorized(amountCents: number, at: Date): boolean {
    const payment = this.expectPayment();
    if (
      payment.status !== PaymentStatus.PENDING_AUTHORIZATION &&
      payment.status !== PaymentStatus.FAILED
    ) {
      return false;
    }
    payment.status = PaymentStatus.AUTHORIZED;
    payment.authorizedCents = amountCents;
    payment.authorizedAt = at;
    payment.failureCode = null;
    if (this.props.status !== SessionStatus.AWAITING_PAYMENT) {
      return false;
    }
    this.props.status = SessionStatus.PENDING;
    return true;
  }

  recordPaymentFailed(failureCode: string): void {
    const payment = this.expectPayment();
    if (
      payment.status === PaymentStatus.PENDING_AUTHORIZATION ||
      payment.status === PaymentStatus.FAILED
    ) {
      payment.status = PaymentStatus.FAILED;
      payment.failureCode = failureCode;
    }
  }

  recordPaymentCanceled(at: Date): void {
    const payment = this.expectPayment();
    if (
      payment.status === PaymentStatus.CAPTURED ||
      payment.status === PaymentStatus.CANCELED
    ) {
      return;
    }
    payment.status = PaymentStatus.CANCELED;
    payment.canceledAt = at;
    if (this.props.status === SessionStatus.AWAITING_PAYMENT) {
      this.interrupt(at);
    }
  }

  recordPaymentCaptured(amountCents: number, at: Date): void {
    const payment = this.expectPayment();
    if (payment.status === PaymentStatus.CAPTURED) {
      return;
    }
    payment.status = PaymentStatus.CAPTURED;
    payment.capturedCents = amountCents;
    payment.capturedAt = at;
  }

  isPaymentOverdue(now: Date, timeoutMinutes: number): boolean {
    return (
      this.props.status === SessionStatus.AWAITING_PAYMENT &&
      now.getTime() - this.props.startedAt.getTime() >=
        timeoutMinutes * MINUTE_IN_MS
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
      case SessionStatus.AWAITING_PAYMENT:
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

  recordAnomaly(result: AnomalyResult): void {
    this.expectStatus(SessionStatus.CLOSED);
    this.props.anomalyScore = result.score;
    this.props.isAnomaly = result.isAnomaly;
    this.props.anomalyModelVersion = result.modelVersion;
  }

  private timelineChargingEnd(projected: Date | null): Date | null {
    switch (this.props.status) {
      case SessionStatus.ACTIVE:
        return projected;
      case SessionStatus.GRACE:
      case SessionStatus.IDLE:
        return this.props.chargingEndedAt;
      default:
        return null;
    }
  }

  private graceEndFrom(chargingEndsAt: Date | null): Date | null {
    if (!chargingEndsAt) {
      return null;
    }
    return addSessionMinutes(
      chargingEndsAt,
      this.props.gracePeriodMinutes,
      this.props.timeScale,
    );
  }

  private idleFeeCapFrom(idleStartsAt: Date | null): Date | null {
    const { idleFeeCentsPerMinute, idleFeeCapCents, timeScale } = this.props;
    if (!idleStartsAt || idleFeeCentsPerMinute <= 0) {
      return null;
    }
    return addSessionMinutes(
      idleStartsAt,
      Math.ceil(idleFeeCapCents / idleFeeCentsPerMinute),
      timeScale,
    );
  }

  private expectStatus(status: SessionStatus): void {
    if (this.props.status !== status) {
      throw new InvalidSessionTransitionError(
        `Expected a ${status} session but it is ${this.props.status}`,
      );
    }
  }

  private expectPayment(): SessionPayment {
    if (!this.props.payment) {
      throw new InvalidSessionTransitionError('Session has no payment');
    }
    return this.props.payment;
  }

  private payableEnergyWh(): number {
    const { payment, idleFeeCapCents, lockedRateCents } = this.props;
    if (!payment) {
      return Number.MAX_SAFE_INTEGER;
    }
    return chargeableEnergyWh(
      payment.authorizedCents,
      idleFeeCapCents,
      lockedRateCents,
    );
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
