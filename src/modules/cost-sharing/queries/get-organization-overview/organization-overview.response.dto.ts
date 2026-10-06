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
import { ChargePointStatus } from '../../../charge-points/charge-point-status.js';
import { ChargePointPricingDto } from '../../../charge-points/dto/charge-point-pricing.dto.js';
import {
  OrganizationSessionDriverDto,
  OrganizationSessionPointDto,
} from '../list-organization-sessions/organization-session.response.dto.js';

export class WeeklyEnergyDto {
  @ApiProperty({ example: 1, description: 'Week of the month (days 1-7 = 1)' })
  week: number;

  @ApiProperty({ example: 218.4 })
  energyKwh: number;
}

export class SiteCapacityDto {
  @ApiProperty({ example: 75 })
  contractedDemandKw: number;

  @ApiProperty({ example: 11.5 })
  commonAreaReserveKw: number;

  @ApiProperty({
    example: 14,
    description: 'Power of the sessions charging now',
  })
  chargingDemandKw: number;

  @ApiProperty({
    example: 25.5,
    description: 'Common area reserve plus the sessions charging now',
  })
  currentDemandKw: number;

  @ApiProperty({ example: 34, description: 'Current demand over contracted' })
  utilizationPercent: number;

  @ApiProperty({
    example: 40.2,
    description:
      'Average over the days with sessions of the daily peak (reserve plus overlapping sessions)',
  })
  averagePeakDemandKw: number;

  @ApiProperty({ example: 53.6 })
  averagePeakUtilizationPercent: number;

  @ApiProperty({
    description:
      'True when the average daily peak is above 80% of the contracted demand',
  })
  upgradeRecommended: boolean;
}

export class RecentAnomalyDto {
  @ApiProperty({ format: 'uuid' })
  sessionId: string;

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
  endedAt: Date | null;

  @ApiProperty({ example: 41 })
  energyKwh: number;

  @ApiProperty({ example: 0 })
  idleMinutes: number;

  @ApiProperty({ example: 3649 })
  totalCents: number;

  @ApiProperty({ type: Number, nullable: true, example: 0.565 })
  anomalyScore: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'v1' })
  anomalyModelVersion: string | null;

  @ApiProperty(ANOMALY_REVIEW_STATUS_PROPERTY)
  anomalyReviewStatus: AnomalyReviewStatus | null;

  @ApiProperty(ANOMALY_REVIEW_NOTE_PROPERTY)
  anomalyReviewNote: string | null;

  @ApiProperty(ANOMALY_REVIEWED_AT_PROPERTY)
  anomalyReviewedAt: Date | null;

  @ApiProperty(ANOMALY_REVIEWED_BY_ID_PROPERTY)
  anomalyReviewedById: string | null;
}

export class MonthComparisonDto {
  @ApiProperty({ example: '2026-07' })
  month: string;

  @ApiProperty({ example: 1190.2 })
  energyKwh: number;

  @ApiProperty({ example: 96 })
  sessionsCount: number;

  @ApiProperty({
    example: 121_870,
    description: 'Energy cost of the sessions started in the month',
  })
  energyCents: number;

  @ApiProperty({
    example: 128_420,
    description:
      'Total of the sessions started in the month (energy plus idle fees)',
  })
  totalCents: number;
}

export class MonthPeakDto {
  @ApiProperty({
    example: 36,
    description:
      'Highest simultaneous charging demand of the sessions started in the month, without the common area reserve',
  })
  demandKw: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the peak started, null without charging in the month',
  })
  at: Date | null;
}

export class OverviewActiveSessionDto {
  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty({
    enum: ChargingSessionStatus,
    enumName: 'ChargingSessionStatus',
  })
  status: ChargingSessionStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When the free grace period ends (set once charging ended, in GRACE and IDLE); the idle fee starts at this instant',
  })
  graceEndsAt: Date | null;
}

export class OverviewChargePointDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'L1-01' })
  code: string;

  @ApiProperty({ example: 'Garagem L1 · Vaga 12' })
  name: string;

  @ApiProperty({ enum: ChargePointType, enumName: 'ChargePointType' })
  type: ChargePointType;

  @ApiProperty({ example: 7 })
  maxPowerKw: number;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uri',
    example: 'https://app.evchargeops.com.br/media/points/garage-a.webp',
    description: 'Absolute URL of a photo of the point, null without one',
  })
  photoUrl: string | null;

  @ApiProperty({ enum: ChargePointStatus, enumName: 'ChargePointStatus' })
  status: ChargePointStatus;

  @ApiProperty({
    type: ChargePointPricingDto,
    nullable: true,
    description:
      'Current price of the point; null when no tariff is configured',
  })
  pricing: ChargePointPricingDto | null;

  @ApiProperty({
    example: 6.4,
    description:
      'Power delivered now by the session charging at the point (from its latest telemetry), 0 when it is not charging',
  })
  currentPowerKw: number;

  @ApiProperty({
    type: OverviewActiveSessionDto,
    nullable: true,
    description: 'Open session at the point, null when it is free',
  })
  activeSession: OverviewActiveSessionDto | null;
}

export class OrganizationOverviewResponseDto {
  @ApiProperty({ example: '2026-08' })
  month: string;

  @ApiProperty({ example: 1284.6 })
  energyKwh: number;

  @ApiProperty({ example: 102 })
  sessionsCount: number;

  @ApiProperty({
    example: 128_930,
    description:
      'Energy cost of the sessions started in the month, every regime',
  })
  energyCents: number;

  @ApiProperty({
    example: 136_210,
    description:
      'Total of the sessions started in the month (energy plus idle fees), every regime',
  })
  totalCents: number;

  @ApiProperty({
    type: MonthComparisonDto,
    description:
      'Same totals for the previous month, for month over month deltas',
  })
  previousMonth: MonthComparisonDto;

  @ApiProperty({
    example: 14,
    description:
      'Sessions of the month at commercial points of the organization or by drivers who are not members',
  })
  visitorSessionsCount: number;

  @ApiProperty({ type: MonthPeakDto })
  monthPeak: MonthPeakDto;

  @ApiProperty({
    example: 1,
    description: 'Sessions open now (charging, grace or idle)',
  })
  activeSessionsCount: number;

  @ApiProperty({
    example: 198_734,
    description: 'Total of the monthly statement',
  })
  costSharingTotalCents: number;

  @ApiProperty({
    example: 45_210,
    description: 'Card revenue of the commercial points this month',
  })
  commercialRevenueCents: number;

  @ApiProperty({ example: 21 })
  unitsWithVehicle: number;

  @ApiProperty({ example: 18 })
  unitsWithConsumption: number;

  @ApiProperty({ type: SiteCapacityDto })
  capacity: SiteCapacityDto;

  @ApiProperty({ type: [WeeklyEnergyDto] })
  energyByWeek: WeeklyEnergyDto[];

  @ApiProperty({
    example: 3,
    description: 'Sessions of the month flagged as anomalous',
  })
  anomaliesCount: number;

  @ApiProperty({
    example: 2,
    description:
      'Flagged sessions still waiting for a manager review (PENDING_REVIEW) that started before the end of the month',
  })
  anomaliesPendingReviewCount: number;

  @ApiProperty({
    type: [RecentAnomalyDto],
    description:
      'Latest sessions flagged as anomalous that started before the end of the month, newest first (up to 5)',
  })
  recentAnomalies: RecentAnomalyDto[];

  @ApiProperty({
    type: [OverviewChargePointDto],
    description: 'Charge points of the organization with their current price',
  })
  chargePoints: OverviewChargePointDto[];
}
