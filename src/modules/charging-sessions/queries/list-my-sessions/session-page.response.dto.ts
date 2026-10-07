import { ApiProperty } from '@nestjs/swagger';
import { SessionResponseDto } from '../../dto/session.response.dto.js';

export class SessionPageResponseDto {
  @ApiProperty({ type: [SessionResponseDto] })
  items: SessionResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;
}
