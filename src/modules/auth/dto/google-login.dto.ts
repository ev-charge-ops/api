import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token returned by Google Sign-In' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken: string;
}
