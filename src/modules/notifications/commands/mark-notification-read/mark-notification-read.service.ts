import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { NotificationsRepository } from '../../database/notifications.repository.port.js';
import { NotificationResponseDto } from '../../dto/notification.response.dto.js';

@Injectable()
export class MarkNotificationReadService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.repository.markRead(
      userId,
      notificationId,
      this.clock.now(),
    );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return NotificationResponseDto.fromRecord(notification);
  }
}
