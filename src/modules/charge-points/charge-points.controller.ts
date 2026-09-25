import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ChargePointsService } from './charge-points.service.js';
import { ChargePointResponseDto } from './dto/charge-point.response.dto.js';
import { ListChargePointsQueryDto } from './dto/list-charge-points.query.dto.js';

@ApiTags('charge-points')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('charge-points')
export class ChargePointsController {
  constructor(private readonly chargePoints: ChargePointsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listChargePoints',
    summary:
      'List the charge points of the organizations of the user and the public commercial ones, with the current price, optionally from a single organization',
  })
  @ApiOkResponse({ type: [ChargePointResponseDto] })
  @ApiBadRequestResponse({ description: 'Invalid filters' })
  listChargePoints(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListChargePointsQueryDto,
  ): Promise<ChargePointResponseDto[]> {
    return this.chargePoints.list(user.id, query.organizationId);
  }

  @Get(':chargePointId')
  @ApiOperation({
    operationId: 'getChargePoint',
    summary: 'Get a charge point visible to the user',
  })
  @ApiOkResponse({ type: ChargePointResponseDto })
  @ApiNotFoundResponse({ description: 'Charge point not found' })
  getChargePoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'chargePointId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    chargePointId: string,
  ): Promise<ChargePointResponseDto> {
    return this.chargePoints.get(user.id, chargePointId);
  }
}
