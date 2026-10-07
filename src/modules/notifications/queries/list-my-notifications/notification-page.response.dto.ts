import { ApiProperty } from '@nestjs/swagger';
import { NotificationResponseDto } from '../../dto/notification.response.dto.js';

export class NotificationPageResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 3, description: 'Unread notifications of the user' })
  unreadCount: number;
}
