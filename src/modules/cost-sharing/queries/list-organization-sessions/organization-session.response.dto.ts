import { ApiProperty } from '@nestjs/swagger';
import {
  type AnomalyReviewStatus,
  ChargePointType,
  ChargingSessionStatus,
} from '../../../../generated/prisma/enums.js';
import {
  ANOMALY_REVIEW_NOTE_PROPERTY,
  ANOMALY_REVIEW_STATUS_PROPERTY,
  ANOMALY_REVIEWED_AT_PROPERTY,
  ANOMALY_REVIEWED_BY_ID_PROPERTY,
} from '../../../charging-sessions/dto/anomaly-review.properties.js';

export class OrganizationSessionPointDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'L1-01' })
  code: string;

  @ApiProperty({ example: 'Garagem L1 · Vaga 12' })
  name: string;
}

export class OrganizationSessionDriverDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana Ribeiro' })
  name: string;
}

export class OrganizationSessionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: ChargingSessionStatus,
    enumName: 'ChargingSessionStatus',
  })
  status: ChargingSessionStatus;

  @ApiProperty({ enum: ChargePointType, enumName: 'ChargePointType' })
  regime: ChargePointType;

  @ApiProperty({ type: OrganizationSessionPointDto })
  chargePoint: OrganizationSessionPointDto;

  @ApiProperty({ type: OrganizationSessionDriverDto })
  driver: OrganizationSessionDriverDto;

  @ApiProperty({ type: String, nullable: true, example: 'B · 42' })
  unitLabel: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  chargingEndedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ example: 11.76 })
  energyKwh: number;

  @ApiProperty({ example: 89 })
  lockedRateCents: number;

  @ApiProperty({ example: 1 })
  demandFactor: number;

  @ApiProperty({ example: 1047 })
  energyCostCents: number;

  @ApiProperty({ example: 0 })
  idleMinutes: number;

  @ApiProperty({ example: 0 })
  idleFeeCents: number;

  @ApiProperty({ example: 1047 })
  totalCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Anomaly score from the ML service, when available',
  })
  anomalyScore: number | null;

  @ApiProperty({ type: Boolean, nullable: true })
  isAnomaly: boolean | null;

  @ApiProperty(ANOMALY_REVIEW_STATUS_PROPERTY)
  anomalyReviewStatus: AnomalyReviewStatus | null;

  @ApiProperty(ANOMALY_REVIEW_NOTE_PROPERTY)
  anomalyReviewNote: string | null;

  @ApiProperty(ANOMALY_REVIEWED_AT_PROPERTY)
  anomalyReviewedAt: Date | null;

  @ApiProperty(ANOMALY_REVIEWED_BY_ID_PROPERTY)
  anomalyReviewedById: string | null;
}

export class OrganizationSessionPageDto {
  @ApiProperty({ type: [OrganizationSessionDto] })
  items: OrganizationSessionDto[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
