import { ApiProperty } from '@nestjs/swagger';

export class ReadAllNotificationsResponseDto {
  @ApiProperty({ example: 3, description: 'Notifications marked as read now' })
  markedCount: number;

  @ApiProperty({ example: 0 })
  unreadCount: number;
}
