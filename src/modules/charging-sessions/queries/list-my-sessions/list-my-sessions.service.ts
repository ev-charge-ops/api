import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { resolveMonth } from '../../../../common/time/month.query.dto.js';
import { toResponse } from '../../charging-session.mapper.js';
import { ChargingSessionRepository } from '../../database/charging-session.repository.port.js';
import type { ChargingSession } from '../../domain/charging-session.entity.js';
import { SessionSynchronizer } from '../../session-synchronizer.js';
import type { ListMySessionsQueryDto } from './list-my-sessions.query.dto.js';
import { SessionPageResponseDto } from './session-page.response.dto.js';
import { SessionProjector } from '../../session-projector.js';

@Injectable()
export class ListMySessionsService {
  constructor(
    private readonly sessions: ChargingSessionRepository,
    private readonly synchronizer: SessionSynchronizer,
    private readonly clock: Clock,
    private readonly projector: SessionProjector,
  ) {}

  async execute(
    userId: string,
    query: ListMySessionsQueryDto,
  ): Promise<SessionPageResponseDto> {
    const now = this.clock.now();
    const { items, total } = await this.sessions.listByUser(
      userId,
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
      query.month ? resolveMonth(query.month, now) : undefined,
    );
    const synced: ChargingSession[] = [];
    for (const session of items) {
      synced.push(await this.synchronizer.sync(session, now));
    }
    return Object.assign(new SessionPageResponseDto(), {
      items: synced.map((session) =>
        toResponse(session, this.projector.timelineOf(session)),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
