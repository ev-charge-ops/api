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
import { MonthQueryDto } from '../get-monthly-statement/month.query.dto.js';
import { GetOrganizationOverviewService } from './get-organization-overview.service.js';
import { OrganizationOverviewResponseDto } from './organization-overview.response.dto.js';

@ApiTags('cost-sharing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/overview')
export class GetOrganizationOverviewController {
  constructor(private readonly service: GetOrganizationOverviewService) {}

  @Get()
  @ApiOperation({
    operationId: 'getOrganizationOverview',
    summary:
      'Monthly indicators of the organization (managers only): energy, sessions, cost-sharing total and electrical capacity',
  })
  @ApiOkResponse({ type: OrganizationOverviewResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid month' })
  getOrganizationOverview(
    @Param('organizationId') organizationId: string,
    @Query() query: MonthQueryDto,
  ): Promise<OrganizationOverviewResponseDto> {
    return this.service.execute(organizationId, query.month);
  }
}
