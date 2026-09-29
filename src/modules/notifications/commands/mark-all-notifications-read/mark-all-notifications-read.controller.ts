import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { MarkAllNotificationsReadService } from './mark-all-notifications-read.service.js';
import { ReadAllNotificationsResponseDto } from './read-all-notifications.response.dto.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/notifications')
export class MarkAllNotificationsReadController {
  constructor(private readonly service: MarkAllNotificationsReadService) {}

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'markAllNotificationsRead',
    summary: 'Mark every unread notification of the user as read',
  })
  @ApiOkResponse({ type: ReadAllNotificationsResponseDto })
  markAllNotificationsRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReadAllNotificationsResponseDto> {
    return this.service.execute(user.id);
  }
}
