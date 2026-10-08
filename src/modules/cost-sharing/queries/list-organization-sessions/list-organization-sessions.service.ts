import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { resolveMonth } from '../../../../common/time/month.query.dto.js';
import { CostSharingRepository } from '../../database/cost-sharing.repository.port.js';
import {
  OrganizationSessionDto,
  OrganizationSessionPageDto,
} from './organization-session.response.dto.js';
import type { OrganizationSessionsQueryDto } from './organization-sessions.query.dto.js';

@Injectable()
export class ListOrganizationSessionsService {
  constructor(
    private readonly repository: CostSharingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    organizationId: string,
    query: OrganizationSessionsQueryDto,
  ): Promise<OrganizationSessionPageDto> {
    const { items, total } = await this.repository.listSessions(
      organizationId,
      {
        range: query.month ? resolveMonth(query.month, this.clock.now()) : null,
        unitLabel: query.unit || undefined,
        status: query.status,
        chargePointId: query.chargePointId,
        anomaly: query.anomaly,
        reviewStatus: query.reviewStatus,
      },
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    return Object.assign(new OrganizationSessionPageDto(), {
      items: items.map(({ energyWh, ...row }) =>
        Object.assign(new OrganizationSessionDto(), {
          ...row,
          energyKwh: energyWh / 1000,
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
