import { ApiProperty } from '@nestjs/swagger';
import { ChargePointType } from '../../../generated/prisma/enums.js';
import { ChargePointStatus } from '../charge-point-status.js';
import { ChargePointPricingDto } from './charge-point-pricing.dto.js';
import { QueueEntryResponseDto } from '../queue/dto/queue-entry.response.dto.js';
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

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uri',
    example: 'https://app.evchargeops.com.br/media/points/garage-a.webp',
    description: 'Absolute URL of a photo of the point, null without one',
  })
  photoUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Dados de localização © Open Charge Map (CC BY-SA 4.0)',
    description:
      'Data attribution to show with the point, set for points imported from Open Charge Map and null otherwise',
  })
  attribution: string | null;

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

  @ApiProperty({
    example: 2,
    description: 'People waiting or holding a reservation at this point',
  })
  queueLength: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Set while the point is free but reserved for the head of the queue; only that user can start a session until then',
  })
  reservedUntil: Date | null;

  @ApiProperty({
    type: QueueEntryResponseDto,
    nullable: true,
    description: 'Your active entry in the queue of this point',
  })
  myQueueEntry: QueueEntryResponseDto | null;
}
