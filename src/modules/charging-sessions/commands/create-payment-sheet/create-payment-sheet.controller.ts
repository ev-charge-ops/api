import {
  Controller,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { PaymentSheetDto } from '../../dto/payment-sheet.dto.js';
import { CreatePaymentSheetService } from './create-payment-sheet.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class CreatePaymentSheetController {
  constructor(private readonly service: CreatePaymentSheetService) {}

  @Post(':sessionId/payment/sheet')
  @ApiOperation({
    operationId: 'createSessionPaymentSheet',
    summary:
      'Issue fresh PaymentSheet parameters (new ephemeral key) for a session still AWAITING_PAYMENT, e.g. after the app was reopened',
  })
  @ApiCreatedResponse({ type: PaymentSheetDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'PAYMENT_NOT_REQUIRED: the session is not paid by card; PAYMENT_NOT_PENDING: the hold is no longer awaiting confirmation',
  })
  @ApiBadGatewayResponse({
    description: 'PAYMENT_PROVIDER_ERROR: Stripe could not be reached',
  })
  createSessionPaymentSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'sessionId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    sessionId: string,
  ): Promise<PaymentSheetDto> {
    return this.service.execute(user.id, sessionId);
  }
}
