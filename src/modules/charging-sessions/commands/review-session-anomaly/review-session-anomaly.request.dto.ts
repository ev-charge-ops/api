import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../auth/dto/transforms.js';
import {
  ANOMALY_REVIEW_DECISIONS,
  type AnomalyReviewDecision,
} from '../../domain/anomaly-review.js';

export const MAX_REVIEW_NOTE_LENGTH = 500;

export class ReviewSessionAnomalyRequestDto {
  @ApiProperty({
    enum: ANOMALY_REVIEW_DECISIONS,
    enumName: 'AnomalyReviewDecision',
    description:
      'CONFIRMED keeps the session as an anomaly, DISMISSED marks it as a false positive',
  })
  @IsIn(ANOMALY_REVIEW_DECISIONS)
  status: AnomalyReviewDecision;

  @ApiPropertyOptional({
    maxLength: MAX_REVIEW_NOTE_LENGTH,
    example: 'Morador confirmou a recarga de um veículo visitante',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_REVIEW_NOTE_LENGTH)
  note?: string;
}
