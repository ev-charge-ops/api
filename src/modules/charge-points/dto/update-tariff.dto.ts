import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_RATE_CENTS = 10_000;
const MAX_FEE_CENTS = 100_000;
const MAX_GRACE_MINUTES = 240;

export class UpdateTariffDto {
  @ApiPropertyOptional({ example: 89, minimum: 0, maximum: MAX_RATE_CENTS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  utilityRateCents?: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 189,
    minimum: 0,
    maximum: MAX_RATE_CENTS,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  baseRateCents?: number | null;

  @ApiPropertyOptional({ example: 3500, minimum: 0, maximum: MAX_FEE_CENTS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_FEE_CENTS)
  accessFeeCents?: number;

  @ApiPropertyOptional({ example: 25, minimum: 0, maximum: MAX_RATE_CENTS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  idleFeeCentsPerMinute?: number;

  @ApiPropertyOptional({ example: 3000, minimum: 0, maximum: MAX_FEE_CENTS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_FEE_CENTS)
  idleFeeCapCents?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: MAX_GRACE_MINUTES })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_GRACE_MINUTES)
  gracePeriodMinutes?: number;
}
