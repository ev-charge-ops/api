import { ApiProperty } from '@nestjs/swagger';
import { StatementStatus } from '../../domain/unit-statement.js';

export class StatementOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Residencial Aclimação' })
  name: string;
}

export class DailyEnergyDto {
  @ApiProperty({ example: '2026-08-03', format: 'date' })
  date: string;

  @ApiProperty({ example: 11.76 })
  energyKwh: number;
}

export class MyMonthlyStatementResponseDto {
  @ApiProperty({ type: StatementOrganizationDto })
  organization: StatementOrganizationDto;

  @ApiProperty({ example: 'B · 42' })
  unitLabel: string;

  @ApiProperty({ example: '2026-08' })
  month: string;

  @ApiProperty({
    enum: StatementStatus,
    enumName: 'StatementStatus',
    description:
      'OPEN while the month is running (amounts may still grow), CLOSED once it ended',
  })
  status: StatementStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'End of the month in America/Sao_Paulo',
  })
  closesAt: Date;

  @ApiProperty({ example: 15.81 })
  energyKwh: number;

  @ApiProperty({ example: 1407, description: 'Energy at the locked rates' })
  energyCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 89,
    description:
      'Utility rate per kWh of the condominium tariff in force at the end of the month, null without a tariff',
  })
  utilityRateCents: number | null;

  @ApiProperty({
    example: 3500,
    description: 'Monthly access fee, charged when the unit has a vehicle',
  })
  accessFeeCents: number;

  @ApiProperty({ example: 150 })
  idleFeeCents: number;

  @ApiProperty({ example: 5057 })
  totalCents: number;

  @ApiProperty({ example: 2 })
  sessionsCount: number;

  @ApiProperty({
    type: [DailyEnergyDto],
    description:
      'Energy of the unit per day of the month, every day included (zero without charges)',
  })
  dailyEnergy: DailyEnergyDto[];
}
