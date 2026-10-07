import { ApiProperty } from '@nestjs/swagger';
import {
  ChargePointSource,
  ChargePointType,
  ConnectorType,
} from '../../../generated/prisma/enums.js';
import { ChargePointStatus } from '../charge-point-status.js';

export class ChargePointMapItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'L1-01' })
  code: string;

  @ApiProperty({ example: 'Garagem L1 · Vaga 12' })
  name: string;

  @ApiProperty({ enum: ChargePointType, enumName: 'ChargePointType' })
  type: ChargePointType;

  @ApiProperty({ enum: ChargePointStatus, enumName: 'ChargePointStatus' })
  status: ChargePointStatus;

  @ApiProperty({ example: -23.56905 })
  latitude: number;

  @ApiProperty({ example: -46.63145 })
  longitude: number;

  @ApiProperty({ example: 22 })
  maxPowerKw: number;

  @ApiProperty({
    enum: ConnectorType,
    enumName: 'ConnectorType',
    nullable: true,
    description: 'Connector of the first charger, null without a charger',
  })
  connector: ConnectorType | null;

  @ApiProperty({
    example: 'Residencial Aclimação',
    description: 'Name of the organization that operates the point',
  })
  operatorName: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 189,
    description:
      'Base price per kWh in cents without the demand factor: the base rate of commercial points, the utility rate of private ones. Null without a tariff',
  })
  basePricePerKwhCents: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 227,
    description:
      'Price per kWh in cents with the demand factor already cached for the operator in this hour, or the base price when none is cached. The detail (getChargePoint) has the exact price',
  })
  pricePerKwhCents: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uri',
    example: 'https://app.evchargeops.com.br/media/points/garage-a.webp',
  })
  photoUrl: string | null;

  @ApiProperty({
    enum: ChargePointSource,
    enumName: 'ChargePointSource',
    description:
      'SEED for the demo network, OCM for points imported from Open Charge Map',
  })
  source: ChargePointSource;
}
