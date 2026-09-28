import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../auth/dto/transforms.js';

export class RequestAccountDeletionRequestDto {
  @ApiPropertyOptional({
    example: 'Mudei de condomínio',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
