import { ApiProperty } from '@nestjs/swagger';
import {
  ChargePointType,
  ChargingLimitType,
  ChargingSessionStatus,
  DemandFactorSource,
} from '../../../generated/prisma/enums.js';
import { SessionPaymentDto } from './session-payment.dto.js';

export class SessionChargePointDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'L1-01' })
  code: string;

  @ApiProperty({ example: 'Garagem L1 · Vaga 12' })
  name: string;
}

export class SessionLimitDto {
  @ApiProperty({ enum: ChargingLimitType, enumName: 'ChargingLimitType' })
  type: ChargingLimitType;

  @ApiProperty({ type: Number, nullable: true, example: 10 })
  energyKwh: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 2000 })
  amountCents: number | null;
}

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: ChargingSessionStatus,
    enumName: 'ChargingSessionStatus',
    description:
      'AWAITING_PAYMENT until the card hold is authorized (commercial points only), PENDING while the charger starts, ACTIVE while charging, GRACE after the battery is full (no fee), IDLE once the grace period ends (idle fee per minute up to the cap), CLOSED when ended by the driver, INTERRUPTED when it never charged (payment canceled or expired, charger failure)',
  })
  status: ChargingSessionStatus;

  @ApiProperty({ type: SessionChargePointDto })
  chargePoint: SessionChargePointDto;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ type: String, nullable: true, example: 'B · 42' })
  unitLabel: string | null;

  @ApiProperty({ enum: ChargePointType, enumName: 'ChargePointType' })
  regime: ChargePointType;

  @ApiProperty({ type: SessionLimitDto })
  limit: SessionLimitDto;

  @ApiProperty({ type: Number, nullable: true, example: 29 })
  targetEnergyKwh: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  chargingEndedAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when the free grace period ends, set once charging ends; schedule the reminder to unplug for this instant',
  })
  graceEndsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when the idle fee starts to accrue (same instant as graceEndsAt)',
  })
  idleStartsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when the idle fee reaches its cap, null without an idle fee',
  })
  idleFeeCapReachedAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when charging is expected to end, projected from the simulation model while ACTIVE and equal to chargingEndedAt in GRACE or IDLE; recomputed from the current session state on every read, null before the charger starts, after the session ends or when the charger cannot predict it. Schedule the charging complete reminder for this instant',
  })
  projectedChargingEndsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when the free grace period is expected to end (projectedChargingEndsAt plus the grace period), equal to graceEndsAt once charging ended',
  })
  projectedGraceEndsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when the idle fee is expected to start (same instant as projectedGraceEndsAt), equal to idleStartsAt once charging ended',
  })
  projectedIdleStartsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Real time when the idle fee is expected to reach its cap, null without an idle fee',
  })
  projectedIdleFeeCapReachedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ example: 11.76 })
  energyKwh: number;

  @ApiProperty({ example: 7 })
  powerKw: number;

  @ApiProperty({ example: 7 })
  allocatedPowerKw: number;

  @ApiProperty({ type: Number, nullable: true, example: 66 })
  socPercent: number | null;

  @ApiProperty({ example: 89, description: 'Price per kWh locked at start' })
  lockedRateCents: number;

  @ApiProperty({ example: 1 })
  demandFactor: number;

  @ApiProperty({ enum: DemandFactorSource, enumName: 'DemandFactorSource' })
  demandFactorSource: DemandFactorSource;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Version of the ML model that produced the demand factor',
  })
  demandModelVersion: string | null;

  @ApiProperty({ example: 1047 })
  energyCostCents: number;

  @ApiProperty({ example: 10 })
  gracePeriodMinutes: number;

  @ApiProperty({ example: 25 })
  idleFeeCentsPerMinute: number;

  @ApiProperty({ example: 3000 })
  idleFeeCapCents: number;

  @ApiProperty({ example: 0 })
  idleMinutes: number;

  @ApiProperty({ example: 0 })
  idleFeeCents: number;

  @ApiProperty({ example: 1047 })
  totalCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Anomaly score from the ML service, set when the session closes',
  })
  anomalyScore: number | null;

  @ApiProperty({ type: Boolean, nullable: true })
  isAnomaly: boolean | null;

  @ApiProperty({
    example: 60,
    description:
      'Simulated seconds per real second for this session (1 with real chargers)',
  })
  simulationSpeed: number;

  @ApiProperty({
    type: SessionPaymentDto,
    nullable: true,
    description:
      'Card payment of commercial sessions (Stripe), null for private sessions billed through the monthly cost sharing',
  })
  payment: SessionPaymentDto | null;
}
