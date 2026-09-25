import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequireOrganizationRole } from '../../../organizations/guards/require-organization-role.decorator.js';
import { ListOrganizationSessionsService } from './list-organization-sessions.service.js';
import { OrganizationSessionPageDto } from './organization-session.response.dto.js';
import { OrganizationSessionsQueryDto } from './organization-sessions.query.dto.js';

@ApiTags('cost-sharing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/sessions')
export class ListOrganizationSessionsController {
  constructor(private readonly service: ListOrganizationSessionsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listOrganizationSessions',
    summary:
      'List the sessions of the organization (managers only), filtered by month, unit, status, charge point and anomaly flag',
  })
  @ApiOkResponse({ type: OrganizationSessionPageDto })
  @ApiBadRequestResponse({ description: 'Invalid filters' })
  listOrganizationSessions(
    @Param('organizationId') organizationId: string,
    @Query() query: OrganizationSessionsQueryDto,
  ): Promise<OrganizationSessionPageDto> {
    return this.service.execute(organizationId, query);
  }
}
