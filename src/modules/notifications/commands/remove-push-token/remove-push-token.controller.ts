import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { RemovePushTokenService } from './remove-push-token.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/push-tokens')
export class RemovePushTokenController {
  constructor(private readonly service: RemovePushTokenService) {}

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'removePushToken',
    summary:
      'Stop sending pushes to this device (call on logout); the token goes URL encoded and unknown tokens are ignored',
  })
  @ApiNoContentResponse({ description: 'Token removed' })
  removePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Promise<void> {
    return this.service.execute(user.id, token);
  }
}
