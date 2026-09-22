import { ApiProperty } from '@nestjs/swagger';
import { ChargePointType } from '../../../generated/prisma/enums.js';
import { ChargePointStatus } from '../charge-point-status.js';
import { ChargePointPricingDto } from './charge-point-pricing.dto.js';
import { ChargerResponseDto } from './charger.response.dto.js';

export class ChargePointResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ example: 'Residencial Aclimação' })
  organizationName: string;

  @ApiProperty({ example: 'L1-01' })
  code: string;

  @ApiProperty({ example: 'Garagem L1 · Vaga 12' })
  name: string;

  @ApiProperty({ enum: ChargePointType, enumName: 'ChargePointType' })
  type: ChargePointType;

  @ApiProperty({ example: -23.56905 })
  latitude: number;

  @ApiProperty({ example: -46.63145 })
  longitude: number;

  @ApiProperty({ example: 7 })
  maxPowerKw: number;

  @ApiProperty({ enum: ChargePointStatus, enumName: 'ChargePointStatus' })
  status: ChargePointStatus;

  @ApiProperty({
    description: 'Whether the user belongs to the organization of the point',
  })
  isMember: boolean;

  @ApiProperty({ type: ChargerResponseDto, nullable: true })
  charger: ChargerResponseDto | null;

  @ApiProperty({
    type: ChargePointPricingDto,
    nullable: true,
    description: 'Null when no tariff is configured',
  })
  pricing: ChargePointPricingDto | null;
}
