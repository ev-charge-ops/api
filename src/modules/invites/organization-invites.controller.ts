import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { RequireOrganizationRole } from '../organizations/guards/require-organization-role.decorator.js';
import { CreateInviteDto } from './dto/create-invite.dto.js';
import { InviteResponseDto } from './dto/invite.response.dto.js';
import { InvitesService } from './invites.service.js';

@ApiTags('invites')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/invites')
export class OrganizationInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @ApiOperation({
    operationId: 'createInvite',
    summary: 'Invite someone by email to join the organization as a driver',
  })
  @ApiCreatedResponse({ type: InviteResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiConflictResponse({
    description:
      'Email already belongs to a member (ALREADY_MEMBER) or has a pending invite (INVITE_ALREADY_PENDING)',
  })
  createInvite(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ): Promise<InviteResponseDto> {
    return this.invites.create(organizationId, user.id, dto);
  }

  @Get()
  @ApiOperation({
    operationId: 'listInvites',
    summary: 'List pending, expired and accepted invites',
  })
  @ApiOkResponse({ type: [InviteResponseDto] })
  listInvites(
    @Param('organizationId') organizationId: string,
  ): Promise<InviteResponseDto[]> {
    return this.invites.list(organizationId);
  }

  @Post(':inviteId/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'resendInvite',
    summary: 'Issue a new link, extend the expiry and send the invite again',
  })
  @ApiOkResponse({ type: InviteResponseDto })
  @ApiConflictResponse({
    description:
      'Invite already accepted or revoked, or the email is already a member or has another pending invite',
  })
  resendInvite(
    @Param('organizationId') organizationId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<InviteResponseDto> {
    return this.invites.resend(organizationId, inviteId);
  }

  @Delete(':inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'revokeInvite', summary: 'Revoke an invite' })
  @ApiNoContentResponse({ description: 'Invite revoked' })
  @ApiConflictResponse({ description: 'Invite already accepted' })
  revokeInvite(
    @Param('organizationId') organizationId: string,
    @Param('inviteId') inviteId: string,
  ): Promise<void> {
    return this.invites.revoke(organizationId, inviteId);
  }
}
