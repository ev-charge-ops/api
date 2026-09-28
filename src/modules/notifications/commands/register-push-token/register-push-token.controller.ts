import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { PushTokenResponseDto } from './push-token.response.dto.js';
import { RegisterPushTokenRequestDto } from './register-push-token.request.dto.js';
import { RegisterPushTokenService } from './register-push-token.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/push-tokens')
export class RegisterPushTokenController {
  constructor(private readonly service: RegisterPushTokenService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'registerPushToken',
    summary:
      'Register the Expo push token of this device for the user; a token registered by another account moves to this one',
  })
  @ApiOkResponse({ type: PushTokenResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid token or platform' })
  registerPushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushTokenRequestDto,
  ): Promise<PushTokenResponseDto> {
    return this.service.execute(user.id, dto);
  }
}
