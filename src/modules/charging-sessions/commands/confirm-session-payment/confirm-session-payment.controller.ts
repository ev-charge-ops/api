import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { SessionResponseDto } from '../../dto/session.response.dto.js';
import { ConfirmSessionPaymentService } from './confirm-session-payment.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class ConfirmSessionPaymentController {
  constructor(private readonly service: ConfirmSessionPaymentService) {}

  @Post(':sessionId/payment/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'confirmSessionPayment',
    summary:
      'Check the card hold with Stripe after the PaymentSheet completes: an authorized hold starts charging, a canceled one interrupts the session. Idempotent and safe to call again (the Stripe webhook does the same)',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'PAYMENT_NOT_REQUIRED: the session is not paid by card',
  })
  @ApiBadGatewayResponse({
    description: 'PAYMENT_PROVIDER_ERROR: Stripe could not be reached',
  })
  confirmSessionPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'sessionId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    sessionId: string,
  ): Promise<SessionResponseDto> {
    return this.service.execute(user.id, sessionId);
  }
}
