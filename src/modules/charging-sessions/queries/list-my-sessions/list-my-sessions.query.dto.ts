import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/pagination/pagination.query.dto.js';
import { MONTH_PATTERN } from '../../../../common/time/month.query.dto.js';

export class ListMySessionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: '2026-08',
    pattern: MONTH_PATTERN.source,
    description:
      'Keeps only the sessions started in this calendar month in America/Sao_Paulo',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month must use the YYYY-MM format' })
  month?: string;
}
