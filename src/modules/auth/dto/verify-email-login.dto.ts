import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsExclusiveOf } from '../../../common/validation/is-exclusive-of.decorator.js';
import { normalizeEmail } from './transforms.js';

export class VerifyEmailLoginDto {
  @ApiPropertyOptional({
    format: 'email',
    example: 'ana@example.com',
    description: 'Required with code; must be omitted when token is sent',
  })
  @ValidateIf((dto: VerifyEmailLoginDto) => dto.token === undefined)
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    pattern: '^\\d{6}$',
    example: '042817',
    description: 'Six digit code sent by email; required with email',
  })
  @ValidateIf((dto: VerifyEmailLoginDto) => dto.token === undefined)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a six digit code' })
  code?: string;

  @ApiPropertyOptional({
    description:
      'Token from the magic link; must be sent alone, without email and code',
  })
  @ValidateIf(
    (dto: VerifyEmailLoginDto) =>
      dto.token !== undefined ||
      (dto.email === undefined && dto.code === undefined),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @IsExclusiveOf(['email', 'code'])
  token?: string;
}
