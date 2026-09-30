import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AuthRateLimit } from '../../common/rate-limit/auth-rate-limit.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { UserResponseDto } from '../users/dto/user.response.dto.js';
import { AccountService } from './account.service.js';
import { AuthResponseDto } from './dto/auth.response.dto.js';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto.js';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto.js';

@ApiTags('account')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch()
  @ApiOperation({
    operationId: 'updateMyProfile',
    summary: 'Update the identification data of the authenticated user',
    description:
      'Only the name can be changed; changing the email needs a verification flow and is not supported.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyProfileDto,
  ): Promise<UserResponseDto> {
    return this.account.updateProfile(user.id, dto);
  }

  @AuthRateLimit()
  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'changeMyPassword',
    summary: 'Change or create the password of the authenticated user',
    description:
      'currentPassword is required when the user already has a password (hasPassword). Every refresh token of the user is revoked, including the current one, and a new session is returned that the caller must store in place of the old tokens. A security email is sent.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid payload or INVALID_CURRENT_PASSWORD: the current password is missing or incorrect',
  })
  changeMyPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeMyPasswordDto,
  ): Promise<AuthResponseDto> {
    return this.account.changePassword(user.id, dto);
  }
}
