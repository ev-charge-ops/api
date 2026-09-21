import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { MyOrganizationDto } from './dto/my-organization.dto.js';
import { OrganizationMemberDto } from './dto/organization-member.dto.js';
import { RequireOrganizationRole } from './guards/require-organization-role.decorator.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller()
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('me/organizations')
  @ApiOperation({
    operationId: 'listMyOrganizations',
    summary: 'List the organizations of the authenticated user',
  })
  @ApiOkResponse({ type: [MyOrganizationDto] })
  listMyOrganizations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyOrganizationDto[]> {
    return this.organizations.listForUser(user.id);
  }

  @Get('organizations/:organizationId/members')
  @RequireOrganizationRole('MANAGER')
  @ApiOperation({
    operationId: 'listOrganizationMembers',
    summary: 'List the members of an organization (managers only)',
  })
  @ApiOkResponse({ type: [OrganizationMemberDto] })
  listOrganizationMembers(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationMemberDto[]> {
    return this.organizations.listMembers(organizationId);
  }
}
