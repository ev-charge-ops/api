import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { normalizeEmail, trimString } from '../../auth/dto/transforms.js';

export class CreateInviteDto {
  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ example: 'B · 42', maxLength: 50 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  unitLabel?: string;
}
