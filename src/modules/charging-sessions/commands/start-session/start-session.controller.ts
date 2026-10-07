import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { SessionResponseDto } from '../../dto/session.response.dto.js';
import { StartSessionRequestDto } from './start-session.request.dto.js';
import { StartSessionService } from './start-session.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class StartSessionController {
  constructor(private readonly service: StartSessionService) {}

  @Post()
  @ApiOperation({
    operationId: 'startSession',
    summary:
      'Start charging at a point, locking the price per kWh and the demand factor',
  })
  @ApiCreatedResponse({ type: SessionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or limit' })
  @ApiNotFoundResponse({ description: 'Charge point not found' })
  @ApiConflictResponse({
    description:
      'CHARGE_POINT_BUSY, ACTIVE_SESSION_EXISTS, CHARGE_POINT_OFFLINE, TARIFF_NOT_CONFIGURED or BUILDING_CAPACITY_EXCEEDED',
  })
  @ApiServiceUnavailableResponse({
    description: 'CHARGER_UNAVAILABLE: the charger did not start',
  })
  startSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartSessionRequestDto,
  ): Promise<SessionResponseDto> {
    return this.service.execute(user.id, dto);
  }
}
