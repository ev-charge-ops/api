import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangeMyPasswordDto {
  @ApiPropertyOptional({
    maxLength: 128,
    description:
      'Required when the account already has a password (hasPassword); omit it to create the first password of a Google, Apple or email code account',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword?: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'n3w-s3cure-passw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
