import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { resolveMonth } from '../../../../common/time/month.query.dto.js';
import {
  formatMonth,
  type MonthRange,
} from '../../../../common/time/sao-paulo-time.js';
import { CostSharingRepository } from '../../database/cost-sharing.repository.port.js';
import {
  buildMonthlyStatement,
  type MonthlyStatement,
  type StatementAmounts,
} from '../../domain/monthly-statement.js';
import { MonthlyStatementResponseDto } from './monthly-statement.response.dto.js';

export interface ResolvedStatement {
  range: MonthRange;
  accessFeeCents: number;
  statement: MonthlyStatement;
}

@Injectable()
export class GetMonthlyStatementService {
  constructor(
    private readonly repository: CostSharingRepository,
    private readonly clock: Clock,
  ) {}

  async resolve(
    organizationId: string,
    month: string | undefined,
  ): Promise<ResolvedStatement> {
    const range = resolveMonth(month, this.clock.now());
    const sessions = await this.repository.findBillableSessions(
      organizationId,
      range,
    );
    const unitsWithVehicle =
      await this.repository.findUnitsWithVehicle(organizationId);
    const accessFeeCents = await this.repository.findAccessFeeCents(
      organizationId,
      range.end,
    );
    return {
      range,
      accessFeeCents,
      statement: buildMonthlyStatement({
        unitsWithVehicle,
        sessions,
        accessFeeCents,
      }),
    };
  }

  async execute(
    organizationId: string,
    month: string | undefined,
  ): Promise<MonthlyStatementResponseDto> {
    const { range, accessFeeCents, statement } = await this.resolve(
      organizationId,
      month,
    );
    return Object.assign(new MonthlyStatementResponseDto(), {
      month: formatMonth(range),
      periodStart: range.start,
      periodEnd: range.end,
      accessFeeCents,
      lines: statement.lines.map((line) => ({
        unitLabel: line.unitLabel,
        ...amounts(line),
      })),
      totals: {
        unitsCount: statement.totals.unitsCount,
        ...amounts(statement.totals),
      },
    });
  }
}

function amounts(source: StatementAmounts) {
  return {
    sessionsCount: source.sessionsCount,
    energyKwh: source.energyWh / 1000,
    energyCents: source.energyCents,
    accessFeeCents: source.accessFeeCents,
    idleFeeCents: source.idleFeeCents,
    totalCents: source.totalCents,
  };
}
