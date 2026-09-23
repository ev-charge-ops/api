import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { formatMonth } from '../../../../common/time/sao-paulo-time.js';
import { RequireOrganizationRole } from '../../../organizations/guards/require-organization-role.decorator.js';
import { statementToCsv } from '../../domain/statement-csv.js';
import { GetMonthlyStatementService } from '../get-monthly-statement/get-monthly-statement.service.js';
import { MonthQueryDto } from '../get-monthly-statement/month.query.dto.js';

@ApiTags('cost-sharing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/statements')
export class ExportMonthlyStatementCsvController {
  constructor(private readonly statements: GetMonthlyStatementService) {}

  @Get('export.csv')
  @ApiOperation({
    operationId: 'exportMonthlyStatementCsv',
    summary:
      'Export the monthly statement for the bill importer: unidade;kwh;energia;acesso;ocupacao;total, decimal comma, UTF-8 with BOM',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string' } })
  @ApiBadRequestResponse({ description: 'Invalid month' })
  async exportMonthlyStatementCsv(
    @Param('organizationId') organizationId: string,
    @Query() query: MonthQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const { range, statement } = await this.statements.resolve(
      organizationId,
      query.month,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="rateio-${formatMonth(range)}.csv"`,
    );
    return statementToCsv(statement);
  }
}
