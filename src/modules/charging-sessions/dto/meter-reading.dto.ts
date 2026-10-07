import { ApiProperty } from '@nestjs/swagger';

export class MeterReadingDto {
  @ApiProperty({ type: String, format: 'date-time' })
  at: Date;

  @ApiProperty({ example: 5.833 })
  energyKwh: number;

  @ApiProperty({ example: 7 })
  powerKw: number;

  @ApiProperty({ type: Number, nullable: true, example: 54 })
  socPercent: number | null;
}
