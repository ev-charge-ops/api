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
import { GetMonthlyStatementService } from './get-monthly-statement.service.js';
import { MonthQueryDto } from './month.query.dto.js';
import { MonthlyStatementResponseDto } from './monthly-statement.response.dto.js';

@ApiTags('cost-sharing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/statements')
export class GetMonthlyStatementController {
  constructor(private readonly service: GetMonthlyStatementService) {}

  @Get()
  @ApiOperation({
    operationId: 'getMonthlyStatement',
    summary:
      'Monthly cost-sharing statement per unit: energy at cost, access fee and idle fees (private regime only)',
  })
  @ApiOkResponse({ type: MonthlyStatementResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid month' })
  getMonthlyStatement(
    @Param('organizationId') organizationId: string,
    @Query() query: MonthQueryDto,
  ): Promise<MonthlyStatementResponseDto> {
    return this.service.execute(organizationId, query.month);
  }
}
