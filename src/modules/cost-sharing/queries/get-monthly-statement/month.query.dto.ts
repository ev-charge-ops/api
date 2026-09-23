import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import {
  type MonthRange,
  saoPauloMonth,
  saoPauloMonthOf,
} from '../../../../common/time/sao-paulo-time.js';

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class MonthQueryDto {
  @ApiPropertyOptional({
    example: '2026-08',
    pattern: MONTH_PATTERN.source,
    description:
      'Calendar month in America/Sao_Paulo; defaults to the current month',
  })
  @IsOptional()
  @Matches(MONTH_PATTERN, { message: 'month must use the YYYY-MM format' })
  month?: string;
}

export function resolveMonth(month: string | undefined, now: Date): MonthRange {
  if (!month) {
    return saoPauloMonthOf(now);
  }
  const [year, monthNumber] = month.split('-').map(Number);
  return saoPauloMonth(year, monthNumber);
}
