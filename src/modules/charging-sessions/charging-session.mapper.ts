import type {
  ChargePoint,
  Charger,
  ChargingSession as ChargingSessionRecord,
  MeterReading,
  Payment,
  Prisma,
} from '../../generated/prisma/client.js';
import type { SessionDriver } from './database/charging-session.repository.port.js';
import type { ChargingLimit } from './domain/charging-limit.js';
import {
  ChargingSession,
  type ChargingSessionProps,
  type MeterSample,
  type SessionTimeline,
} from './domain/charging-session.entity.js';
import type { SessionPayment } from './domain/session-payment.js';
import { MeterReadingDto } from './dto/meter-reading.dto.js';
import { OrganizationSessionDetailResponseDto } from './dto/organization-session-detail.response.dto.js';
import { SessionDetailResponseDto } from './dto/session-detail.response.dto.js';
import { SessionPaymentDto } from './dto/session-payment.dto.js';
import { SessionResponseDto } from './dto/session.response.dto.js';

export type ChargingSessionWithPoint = ChargingSessionRecord & {
  chargePoint: Pick<ChargePoint, 'code' | 'name'> & {
    chargers: Pick<Charger, 'serialNumber'>[];
  };
  payment: Payment | null;
};

export const SESSION_INCLUDE = {
  chargePoint: {
    select: {
      code: true,
      name: true,
      chargers: {
        select: { serialNumber: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  },
  payment: true,
} satisfies Prisma.ChargingSessionInclude;

const WH_PER_KWH = 1000;

export function kwhToWh(value: Prisma.Decimal): number {
  return Math.round(value.toNumber() * WH_PER_KWH);
}

export function whToKwh(value: number): number {
  return Math.round(value) / WH_PER_KWH;
}

function kwhDecimal(wh: number): string {
  return (Math.round(wh) / WH_PER_KWH).toFixed(3);
}

function limitFromRecord(record: ChargingSessionRecord): ChargingLimit {
  if (record.limitType === 'ENERGY' && record.limitEnergyKwh) {
    return { type: 'ENERGY', energyWh: kwhToWh(record.limitEnergyKwh) };
  }
  if (record.limitType === 'AMOUNT' && record.limitAmountCents !== null) {
    return { type: 'AMOUNT', amountCents: record.limitAmountCents };
  }
  return { type: 'FULL' };
}

export function toDomain(record: ChargingSessionWithPoint): ChargingSession {
  return ChargingSession.restore({
    id: record.id,
    userId: record.userId,
    chargePointId: record.chargePointId,
    chargePointCode: record.chargePoint.code,
    chargePointName: record.chargePoint.name,
    chargerSerialNumber: record.chargePoint.chargers[0]?.serialNumber ?? '',
    organizationId: record.organizationId,
    unitLabel: record.unitLabel,
    regime: record.regime,
    status: record.status,
    limit: limitFromRecord(record),
    targetEnergyWh: record.targetEnergyKwh
      ? kwhToWh(record.targetEnergyKwh)
      : null,
    allocatedPowerKw: record.allocatedPowerKw.toNumber(),
    batteryCapacityWh: record.batteryCapacityKwh
      ? kwhToWh(record.batteryCapacityKwh)
      : null,
    initialSocPercent: record.initialSocPercent,
    timeScale: record.timeScale,
    lockedRateCents: record.lockedRateCents,
    demandFactor: record.demandFactor.toNumber(),
    demandFactorSource: record.demandFactorSource,
    demandModelVersion: record.demandModelVersion,
    idleFeeCentsPerMinute: record.idleFeeCentsPerMinute,
    idleFeeCapCents: record.idleFeeCapCents,
    gracePeriodMinutes: record.gracePeriodMinutes,
    externalTransactionId: record.externalTransactionId,
    startedAt: record.startedAt,
    chargingEndedAt: record.chargingEndedAt,
    endedAt: record.endedAt,
    telemetryReadAt: record.telemetryReadAt,
    energyWh: kwhToWh(record.energyKwh),
    powerKw: record.powerKw.toNumber(),
    socPercent: record.socPercent,
    energyCostCents: record.energyCostCents,
    idleMinutes: record.idleMinutes,
    idleFeeCents: record.idleFeeCents,
    totalCents: record.totalCents,
    anomalyScore: record.anomalyScore?.toNumber() ?? null,
    isAnomaly: record.isAnomaly,
    anomalyModelVersion: record.anomalyModelVersion,
    payment: record.payment ? paymentToDomain(record.payment) : null,
    version: record.updatedAt,
  });
}

function paymentToDomain(record: Payment): SessionPayment {
  return {
    intentId: record.stripePaymentIntentId,
    customerId: record.stripeCustomerId,
    status: record.status,
    currency: record.currency,
    authorizedCents: record.authorizedCents,
    capturedCents: record.capturedCents,
    failureCode: record.failureCode,
    authorizedAt: record.authorizedAt,
    capturedAt: record.capturedAt,
    canceledAt: record.canceledAt,
  };
}

export function toPaymentData(payment: SessionPayment) {
  return {
    stripePaymentIntentId: payment.intentId,
    stripeCustomerId: payment.customerId,
    status: payment.status,
    currency: payment.currency,
    authorizedCents: payment.authorizedCents,
    capturedCents: payment.capturedCents,
    failureCode: payment.failureCode,
    authorizedAt: payment.authorizedAt,
    capturedAt: payment.capturedAt,
    canceledAt: payment.canceledAt,
  };
}

export function toStateData(props: ChargingSessionProps) {
  return {
    status: props.status,
    startedAt: props.startedAt,
    targetEnergyKwh:
      props.targetEnergyWh === null ? null : kwhDecimal(props.targetEnergyWh),
    batteryCapacityKwh:
      props.batteryCapacityWh === null
        ? null
        : kwhDecimal(props.batteryCapacityWh),
    initialSocPercent: props.initialSocPercent,
    externalTransactionId: props.externalTransactionId,
    chargingEndedAt: props.chargingEndedAt,
    endedAt: props.endedAt,
    telemetryReadAt: props.telemetryReadAt,
    energyKwh: kwhDecimal(props.energyWh),
    powerKw: props.powerKw.toFixed(2),
    socPercent: props.socPercent,
    energyCostCents: props.energyCostCents,
    idleMinutes: props.idleMinutes,
    idleFeeCents: props.idleFeeCents,
    totalCents: props.totalCents,
    anomalyScore:
      props.anomalyScore === null ? null : props.anomalyScore.toFixed(4),
    isAnomaly: props.isAnomaly,
    anomalyModelVersion: props.anomalyModelVersion,
  };
}

export function toCreateData(
  props: ChargingSessionProps,
): Prisma.ChargingSessionUncheckedCreateInput {
  const { limit } = props;
  return {
    id: props.id,
    userId: props.userId,
    chargePointId: props.chargePointId,
    organizationId: props.organizationId,
    unitLabel: props.unitLabel,
    regime: props.regime,
    limitType: limit.type,
    limitEnergyKwh: limit.type === 'ENERGY' ? kwhDecimal(limit.energyWh) : null,
    limitAmountCents: limit.type === 'AMOUNT' ? limit.amountCents : null,
    allocatedPowerKw: props.allocatedPowerKw.toFixed(2),
    timeScale: props.timeScale,
    lockedRateCents: props.lockedRateCents,
    demandFactor: props.demandFactor.toFixed(2),
    demandFactorSource: props.demandFactorSource,
    demandModelVersion: props.demandModelVersion,
    idleFeeCentsPerMinute: props.idleFeeCentsPerMinute,
    idleFeeCapCents: props.idleFeeCapCents,
    gracePeriodMinutes: props.gracePeriodMinutes,
    ...toStateData(props),
  };
}

export function toReadingData(
  sessionId: string,
  sample: MeterSample,
): Prisma.MeterReadingCreateManyInput {
  return {
    sessionId,
    at: sample.at,
    energyKwh: kwhDecimal(sample.energyWh),
    powerKw: sample.powerKw.toFixed(2),
    socPercent: sample.socPercent,
  };
}

export function readingToSample(reading: MeterReading): MeterSample {
  return {
    at: reading.at,
    energyWh: kwhToWh(reading.energyKwh),
    powerKw: reading.powerKw.toNumber(),
    socPercent: reading.socPercent,
  };
}

export function toResponse(
  session: ChargingSession,
  timeline: SessionTimeline,
): SessionResponseDto {
  return Object.assign(
    new SessionResponseDto(),
    responseFields(session, timeline),
  );
}

export function toDetailResponse(
  session: ChargingSession,
  readings: MeterSample[],
  timeline: SessionTimeline,
): SessionDetailResponseDto {
  return Object.assign(
    new SessionDetailResponseDto(),
    responseFields(session, timeline),
    {
      readings: readings.map(toReadingDto),
    },
  );
}

export function toOrganizationDetailResponse(
  session: ChargingSession,
  readings: MeterSample[],
  timeline: SessionTimeline,
  driver: SessionDriver,
): OrganizationSessionDetailResponseDto {
  return Object.assign(
    new OrganizationSessionDetailResponseDto(),
    toDetailResponse(session, readings, timeline),
    {
      driver: { id: driver.id, name: driver.name },
      anomalyModelVersion: session.toProps().anomalyModelVersion,
    },
  );
}

function responseFields(
  session: ChargingSession,
  timeline: SessionTimeline,
): SessionResponseDto {
  const props = session.toProps();
  const { limit } = props;
  return {
    id: props.id,
    status: props.status,
    chargePoint: {
      id: props.chargePointId,
      code: props.chargePointCode,
      name: props.chargePointName,
    },
    organizationId: props.organizationId,
    unitLabel: props.unitLabel,
    regime: props.regime,
    limit: {
      type: limit.type,
      energyKwh: limit.type === 'ENERGY' ? whToKwh(limit.energyWh) : null,
      amountCents: limit.type === 'AMOUNT' ? limit.amountCents : null,
    },
    targetEnergyKwh:
      props.targetEnergyWh === null ? null : whToKwh(props.targetEnergyWh),
    startedAt: props.startedAt,
    chargingEndedAt: props.chargingEndedAt,
    graceEndsAt: session.graceEndsAt,
    idleStartsAt: session.idleStartsAt,
    idleFeeCapReachedAt: session.idleFeeCapReachedAt,
    projectedChargingEndsAt: timeline.chargingEndsAt,
    projectedGraceEndsAt: timeline.graceEndsAt,
    projectedIdleStartsAt: timeline.idleStartsAt,
    projectedIdleFeeCapReachedAt: timeline.idleFeeCapReachedAt,
    endedAt: props.endedAt,
    energyKwh: whToKwh(props.energyWh),
    powerKw: props.powerKw,
    allocatedPowerKw: props.allocatedPowerKw,
    socPercent: props.socPercent,
    lockedRateCents: props.lockedRateCents,
    demandFactor: props.demandFactor,
    demandFactorSource: props.demandFactorSource,
    demandModelVersion: props.demandModelVersion,
    energyCostCents: props.energyCostCents,
    gracePeriodMinutes: props.gracePeriodMinutes,
    idleFeeCentsPerMinute: props.idleFeeCentsPerMinute,
    idleFeeCapCents: props.idleFeeCapCents,
    idleMinutes: props.idleMinutes,
    idleFeeCents: props.idleFeeCents,
    totalCents: props.totalCents,
    anomalyScore: props.anomalyScore,
    isAnomaly: props.isAnomaly,
    simulationSpeed: props.timeScale,
    payment: props.payment ? toPaymentDto(props.payment) : null,
  };
}

function toPaymentDto(payment: SessionPayment): SessionPaymentDto {
  return Object.assign(new SessionPaymentDto(), {
    paymentIntentId: payment.intentId,
    status: payment.status,
    currency: payment.currency,
    authorizedCents: payment.authorizedCents,
    capturedCents: payment.capturedCents,
    failureCode: payment.failureCode,
    authorizedAt: payment.authorizedAt,
    capturedAt: payment.capturedAt,
    canceledAt: payment.canceledAt,
  });
}

export function toReadingDto(sample: MeterSample): MeterReadingDto {
  return Object.assign(new MeterReadingDto(), {
    at: sample.at,
    energyKwh: whToKwh(sample.energyWh),
    powerKw: sample.powerKw,
    socPercent: sample.socPercent,
  });
}
