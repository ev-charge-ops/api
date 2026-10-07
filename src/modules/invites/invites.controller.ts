import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthRateLimit } from '../../common/rate-limit/auth-rate-limit.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AuthResponseDto } from '../auth/dto/auth.response.dto.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { InvitePreviewDto } from './dto/invite-preview.dto.js';
import { InvitesService } from './invites.service.js';

const GONE_DESCRIPTION =
  'Invite expired (INVITE_EXPIRED), revoked (INVITE_REVOKED) or already accepted (INVITE_ALREADY_ACCEPTED)';

@ApiTags('invites')
@ApiNotFoundResponse({ description: 'Unknown invite token (INVITE_NOT_FOUND)' })
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @AuthRateLimit()
  @Get(':token')
  @ApiOperation({
    operationId: 'getInvitePreview',
    summary: 'Show the organization and email of an invite',
  })
  @ApiOkResponse({ type: InvitePreviewDto })
  getInvitePreview(@Param('token') token: string): Promise<InvitePreviewDto> {
    return this.invites.preview(token);
  }

  @Public()
  @AuthRateLimit()
  @Post(':token/accept')
  @ApiOperation({
    operationId: 'acceptInvite',
    summary:
      'Create an account with the invited email and join the organization',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiConflictResponse({
    description:
      'Email already registered (EMAIL_ALREADY_REGISTERED): log in and use accept-authenticated',
  })
  @ApiGoneResponse({ description: GONE_DESCRIPTION })
  acceptInvite(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
  ): Promise<AuthResponseDto> {
    return this.invites.acceptAsNewUser(token, dto);
  }

  @AuthRateLimit()
  @Post(':token/accept-authenticated')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'acceptInviteAsCurrentUser',
    summary: 'Join the organization with the authenticated account',
  })
  @ApiNoContentResponse({ description: 'Membership created' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Invite sent to another email (INVITE_EMAIL_MISMATCH)',
  })
  @ApiConflictResponse({ description: 'Already a member (ALREADY_MEMBER)' })
  @ApiGoneResponse({ description: GONE_DESCRIPTION })
  acceptInviteAsCurrentUser(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.invites.acceptAsUser(token, user.id);
  }
}
