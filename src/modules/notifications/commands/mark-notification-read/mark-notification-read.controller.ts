import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { NotificationResponseDto } from '../../dto/notification.response.dto.js';
import { MarkNotificationReadService } from './mark-notification-read.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/notifications')
export class MarkNotificationReadController {
  constructor(private readonly service: MarkNotificationReadService) {}

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'markNotificationRead',
    summary:
      'Mark a notification as read; repeated calls keep the first readAt',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  markNotificationRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'notificationId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    return this.service.execute(user.id, notificationId);
  }
}
