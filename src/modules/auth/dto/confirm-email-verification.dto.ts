import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @ApiProperty({ description: 'Token received in the verification link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}
