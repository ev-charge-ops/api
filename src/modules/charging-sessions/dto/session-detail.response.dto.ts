import { ApiProperty } from '@nestjs/swagger';
import { MeterReadingDto } from './meter-reading.dto.js';
import { SessionResponseDto } from './session.response.dto.js';

export class SessionDetailResponseDto extends SessionResponseDto {
  @ApiProperty({
    type: [MeterReadingDto],
    description: 'Meter readings recorded so far, oldest first',
  })
  readings: MeterReadingDto[];
}
