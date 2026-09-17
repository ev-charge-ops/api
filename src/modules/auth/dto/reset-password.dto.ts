import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received in the password reset link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'n3w-s3cure-passw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
