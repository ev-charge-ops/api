import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
import { MONTH_PATTERN } from '../../../../common/time/month.query.dto.js';

export class MyMonthlyStatementParamsDto {
  @ApiProperty({
    example: '2026-08',
    pattern: MONTH_PATTERN.source,
    description: 'Calendar month in America/Sao_Paulo',
  })
  @Matches(MONTH_PATTERN, { message: 'month must use the YYYY-MM format' })
  month: string;
}

export class MyMonthlyStatementQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Condominium to read when the user has a unit in more than one; defaults to the first one by name',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
