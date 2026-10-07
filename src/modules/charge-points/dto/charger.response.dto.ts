import { ApiProperty } from '@nestjs/swagger';
import type { Charger } from '../../../generated/prisma/client.js';
import { ConnectorType } from '../../../generated/prisma/enums.js';

export class ChargerResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GoodWe HCA G2' })
  vendor: string;

  @ApiProperty({ example: 'GW-HCA-G2-0001' })
  serialNumber: string;

  @ApiProperty({ enum: ConnectorType, enumName: 'ConnectorType' })
  connector: ConnectorType;

  static fromEntity(charger: Charger): ChargerResponseDto {
    return Object.assign(new ChargerResponseDto(), {
      id: charger.id,
      vendor: charger.vendor,
      serialNumber: charger.serialNumber,
      connector: charger.connector,
    });
  }
}
