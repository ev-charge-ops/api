import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
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
import { StartSessionRequestDto } from './start-session.request.dto.js';
import { StartSessionResponseDto } from './start-session.response.dto.js';
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
      'Start a session at a point, locking the price per kWh and the demand factor. Private points start charging right away; commercial points hold the estimated maximum on the card first (AWAITING_PAYMENT with the PaymentSheet parameters) and start charging once the hold is authorized',
  })
  @ApiCreatedResponse({ type: StartSessionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or limit' })
  @ApiNotFoundResponse({ description: 'Charge point not found' })
  @ApiConflictResponse({
    description:
      'CHARGE_POINT_BUSY, ACTIVE_SESSION_EXISTS, CHARGE_POINT_OFFLINE, TARIFF_NOT_CONFIGURED or BUILDING_CAPACITY_EXCEEDED',
  })
  @ApiServiceUnavailableResponse({
    description:
      'CHARGER_UNAVAILABLE: the charger did not start; PAYMENTS_UNAVAILABLE: card payments are not configured (commercial points)',
  })
  @ApiBadGatewayResponse({
    description: 'PAYMENT_PROVIDER_ERROR: Stripe did not create the hold',
  })
  startSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    return this.service.execute(user.id, dto);
  }
}
