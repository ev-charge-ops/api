import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user.response.dto.js';

export class AuthResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ description: 'JWT access token (Bearer)' })
  accessToken: string;

  @ApiProperty({ description: 'Opaque refresh token, rotated on each use' })
  refreshToken: string;
}
