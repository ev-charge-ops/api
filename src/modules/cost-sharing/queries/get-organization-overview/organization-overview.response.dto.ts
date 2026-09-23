import { ApiProperty } from '@nestjs/swagger';

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
}
