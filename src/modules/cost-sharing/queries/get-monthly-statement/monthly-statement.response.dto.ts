import { ApiProperty } from '@nestjs/swagger';

export class StatementAmountsDto {
  @ApiProperty({ example: 2 })
  sessionsCount: number;

  @ApiProperty({ example: 15.81 })
  energyKwh: number;

  @ApiProperty({ example: 1407, description: 'Energy at the locked rates' })
  energyCents: number;

  @ApiProperty({ example: 3500 })
  accessFeeCents: number;

  @ApiProperty({ example: 150 })
  idleFeeCents: number;

  @ApiProperty({ example: 5057 })
  totalCents: number;
}

export class StatementLineDto extends StatementAmountsDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'B · 42',
    description: 'Null for sessions of members without a unit',
  })
  unitLabel: string | null;
}

export class StatementTotalsDto extends StatementAmountsDto {
  @ApiProperty({ example: 27 })
  unitsCount: number;
}

export class MonthlyStatementResponseDto {
  @ApiProperty({ example: '2026-08' })
  month: string;

  @ApiProperty({ type: String, format: 'date-time' })
  periodStart: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  periodEnd: Date;

  @ApiProperty({
    example: 3500,
    description: 'Monthly access fee charged to each unit with a vehicle',
  })
  accessFeeCents: number;

  @ApiProperty({ type: [StatementLineDto] })
  lines: StatementLineDto[];

  @ApiProperty({ type: StatementTotalsDto })
  totals: StatementTotalsDto;
}
