import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleCodeLoginDto {
  @ApiProperty({
    description:
      'Authorization code returned by the Google OAuth popup (redirect URI "postmessage")',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  code: string;
}
