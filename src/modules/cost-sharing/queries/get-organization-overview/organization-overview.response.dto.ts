import { ApiProperty } from '@nestjs/swagger';
import {
  ChargePointType,
  ChargingSessionStatus,
} from '../../../../generated/prisma/enums.js';
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
}

export class OrganizationOverviewResponseDto {
  @ApiProperty({ example: '2026-08' })
  month: string;

  @ApiProperty({ example: 1284.6 })
  energyKwh: number;

  @ApiProperty({ example: 102 })
  sessionsCount: number;

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
