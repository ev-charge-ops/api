import { ApiProperty } from '@nestjs/swagger';
import {
  DemandFactorSource,
  DemandLevel,
} from '../../intelligence/demand-factor/demand-factor.provider.js';

export class ChargePointPricingDto {
  @ApiProperty({
    example: 89,
    description:
      'Price per kWh in cents if a session started now. Private points pass the utility rate through; commercial points apply the demand factor to the base rate',
  })
  pricePerKwhCents: number;

  @ApiProperty({ example: 89 })
  utilityRateCents: number;

  @ApiProperty({ type: Number, nullable: true, example: 189 })
  baseRateCents: number | null;

  @ApiProperty({ example: 1, description: 'Current demand multiplier' })
  demandFactor: number;

  @ApiProperty({ enum: DemandLevel, enumName: 'DemandLevel' })
  demandLevel: DemandLevel;

  @ApiProperty({ enum: DemandFactorSource, enumName: 'DemandFactorSource' })
  demandFactorSource: DemandFactorSource;

  @ApiProperty({
    description:
      'False on private points, where the factor is informational only (no margin on energy)',
  })
  demandFactorApplied: boolean;

  @ApiProperty({ example: 25 })
  idleFeeCentsPerMinute: number;

  @ApiProperty({ example: 3000 })
  idleFeeCapCents: number;

  @ApiProperty({ example: 10 })
  gracePeriodMinutes: number;
}
