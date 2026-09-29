import { Injectable } from '@nestjs/common';
import type { PaginationQueryDto } from '../../../../common/pagination/pagination.query.dto.js';
import { NotificationsRepository } from '../../database/notifications.repository.port.js';
import { NotificationResponseDto } from '../../dto/notification.response.dto.js';
import { NotificationPageResponseDto } from './notification-page.response.dto.js';

@Injectable()
export class ListMyNotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async execute(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<NotificationPageResponseDto> {
    const { items, total, unreadCount } = await this.repository.listByUser(
      userId,
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );
    return Object.assign(new NotificationPageResponseDto(), {
      items: items.map((item) => NotificationResponseDto.fromRecord(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      unreadCount,
    });
  }
}
