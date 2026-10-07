import { ApiProperty } from '@nestjs/swagger';
import { SessionResponseDto } from '../../dto/session.response.dto.js';

export class ActiveSessionResponseDto {
  @ApiProperty({
    type: SessionResponseDto,
    nullable: true,
    description: 'The open session of the user, or null',
  })
  session: SessionResponseDto | null;
}
