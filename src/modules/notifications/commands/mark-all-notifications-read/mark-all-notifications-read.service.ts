import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { NotificationsRepository } from '../../database/notifications.repository.port.js';
import { ReadAllNotificationsResponseDto } from './read-all-notifications.response.dto.js';

@Injectable()
export class MarkAllNotificationsReadService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<ReadAllNotificationsResponseDto> {
    const markedCount = await this.repository.markAllRead(
      userId,
      this.clock.now(),
    );
    return Object.assign(new ReadAllNotificationsResponseDto(), {
      markedCount,
      unreadCount: await this.repository.unreadCount(userId),
    });
  }
}
