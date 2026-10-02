import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { formatMonth } from '../../../../common/time/sao-paulo-time.js';
import { CostSharingRepository } from '../../database/cost-sharing.repository.port.js';
import {
  dailyEnergyOf,
  statementStatus,
  unitLineOf,
} from '../../domain/unit-statement.js';
import { GetMonthlyStatementService } from '../get-monthly-statement/get-monthly-statement.service.js';
import { MyMonthlyStatementResponseDto } from './my-monthly-statement.response.dto.js';

const WH_PER_KWH = 1000;

@Injectable()
export class GetMyMonthlyStatementService {
  constructor(
    private readonly repository: CostSharingRepository,
    private readonly statements: GetMonthlyStatementService,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    month: string,
    organizationId?: string,
  ): Promise<MyMonthlyStatementResponseDto> {
    const memberships = await this.repository.findUnitMemberships(userId);
    const membership = organizationId
      ? memberships.find((item) => item.organization.id === organizationId)
      : memberships[0];
    if (!membership) {
      throw new NotFoundException('Unit membership not found');
    }
    const { range, utilityRateCents, sessions, statement } =
      await this.statements.resolve(membership.organization.id, month);
    const line = unitLineOf(statement, membership.unitLabel);
    return Object.assign(new MyMonthlyStatementResponseDto(), {
      organization: membership.organization,
      unitLabel: membership.unitLabel,
      month: formatMonth(range),
      status: statementStatus(range, this.clock.now()),
      closesAt: range.end,
      energyKwh: line.energyWh / WH_PER_KWH,
      energyCents: line.energyCents,
      utilityRateCents,
      accessFeeCents: line.accessFeeCents,
      idleFeeCents: line.idleFeeCents,
      totalCents: line.totalCents,
      sessionsCount: line.sessionsCount,
      dailyEnergy: dailyEnergyOf(sessions, membership.unitLabel, range).map(
        (day) => ({ date: day.date, energyKwh: day.energyWh / WH_PER_KWH }),
      ),
    });
  }
}
