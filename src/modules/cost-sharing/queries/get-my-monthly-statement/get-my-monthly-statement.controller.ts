import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { GetMyMonthlyStatementService } from './get-my-monthly-statement.service.js';
import {
  MyMonthlyStatementParamsDto,
  MyMonthlyStatementQueryDto,
} from './my-monthly-statement.request.dto.js';
import { MyMonthlyStatementResponseDto } from './my-monthly-statement.response.dto.js';

@ApiTags('cost-sharing')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/statements')
export class GetMyMonthlyStatementController {
  constructor(private readonly service: GetMyMonthlyStatementService) {}

  @Get(':month')
  @ApiOperation({
    operationId: 'getMyMonthlyStatement',
    summary:
      'Monthly cost-sharing statement of the unit of the authenticated user in a condominium (private regime only), with the energy per day',
  })
  @ApiOkResponse({ type: MyMonthlyStatementResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid month or organization id' })
  @ApiNotFoundResponse({
    description:
      'The user has no unit in a private organization, or not in the requested one',
  })
  getMyMonthlyStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MyMonthlyStatementParamsDto,
    @Query() query: MyMonthlyStatementQueryDto,
  ): Promise<MyMonthlyStatementResponseDto> {
    return this.service.execute(user.id, params.month, query.organizationId);
  }
}
