import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ChargingLimitType } from '../../../../generated/prisma/enums.js';

export const MAX_LIMIT_VALUE = 100_000;

export class ChargingLimitRequestDto {
  @ApiProperty({ enum: ChargingLimitType, enumName: 'ChargingLimitType' })
  @IsIn(Object.values(ChargingLimitType))
  type: ChargingLimitType;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Required for ENERGY (kWh, up to 3 decimals) and AMOUNT (integer cents)',
  })
  @ValidateIf((limit: ChargingLimitRequestDto) => limit.type !== 'FULL')
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_LIMIT_VALUE)
  value?: number;
}

export class StartSessionRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  chargePointId: string;

  @ApiPropertyOptional({
    type: ChargingLimitRequestDto,
    description: 'Defaults to FULL',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChargingLimitRequestDto)
  limit?: ChargingLimitRequestDto;
}
