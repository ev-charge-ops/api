import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../../../../common/pagination/pagination.query.dto.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { ListMyNotificationsService } from './list-my-notifications.service.js';
import { NotificationPageResponseDto } from './notification-page.response.dto.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/notifications')
export class ListMyNotificationsController {
  constructor(private readonly service: ListMyNotificationsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listMyNotifications',
    summary:
      'List the notifications of the user, newest first, with the unread count',
  })
  @ApiOkResponse({ type: NotificationPageResponseDto })
  listMyNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<NotificationPageResponseDto> {
    return this.service.execute(user.id, query);
  }
}
