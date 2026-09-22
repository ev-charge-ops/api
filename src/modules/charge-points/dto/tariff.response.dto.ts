import { ApiProperty } from '@nestjs/swagger';
import type { Tariff } from '../../../generated/prisma/client.js';

export class TariffResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({
    example: 89,
    description: 'Utility energy rate per kWh in cents, passed through',
  })
  utilityRateCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 189,
    description: 'Base rate per kWh in cents on commercial points',
  })
  baseRateCents: number | null;

  @ApiProperty({
    example: 3500,
    description: 'Monthly access fee per unit with a vehicle, in cents',
  })
  accessFeeCents: number;

  @ApiProperty({ example: 25 })
  idleFeeCentsPerMinute: number;

  @ApiProperty({ example: 3000 })
  idleFeeCapCents: number;

  @ApiProperty({ example: 10 })
  gracePeriodMinutes: number;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom: Date;

  static fromEntity(tariff: Tariff): TariffResponseDto {
    return Object.assign(new TariffResponseDto(), {
      id: tariff.id,
      organizationId: tariff.organizationId,
      utilityRateCents: tariff.utilityRateCents,
      baseRateCents: tariff.baseRateCents,
      accessFeeCents: tariff.accessFeeCents,
      idleFeeCentsPerMinute: tariff.idleFeeCentsPerMinute,
      idleFeeCapCents: tariff.idleFeeCapCents,
      gracePeriodMinutes: tariff.gracePeriodMinutes,
      validFrom: tariff.validFrom,
    });
  }
}
