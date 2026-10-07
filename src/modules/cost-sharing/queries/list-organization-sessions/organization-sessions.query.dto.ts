import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination.query.dto.js';
import { MONTH_PATTERN } from '../../../../common/time/month.query.dto.js';
import { ChargingSessionStatus } from '../../../../generated/prisma/enums.js';
import { parseBooleanQuery, trimString } from '../../../auth/dto/transforms.js';

export class OrganizationSessionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-08', pattern: MONTH_PATTERN.source })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month must use the YYYY-MM format' })
  month?: string;

  @ApiPropertyOptional({ example: 'B · 42' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiPropertyOptional({
    enum: ChargingSessionStatus,
    enumName: 'ChargingSessionStatus',
  })
  @IsOptional()
  @IsIn(Object.values(ChargingSessionStatus))
  status?: ChargingSessionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  chargePointId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true keeps only the sessions flagged as anomalous; false keeps the ones not flagged (including the unscored)',
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  anomaly?: boolean;
}
