import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { HandleStripeWebhookService } from './handle-stripe-webhook.service.js';
import { WebhookReceiptDto } from './webhook-receipt.dto.js';

@ApiTags('payments')
@Controller('payments/stripe')
export class HandleStripeWebhookController {
  constructor(private readonly service: HandleStripeWebhookService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'handleStripeWebhook',
    summary:
      'Stripe webhook (payment_intent.amount_capturable_updated, canceled, payment_failed, succeeded). Verifies the signature over the raw body and reconciles the session with the PaymentIntent; duplicates are ignored',
  })
  @ApiHeader({ name: 'stripe-signature', required: true })
  @ApiOkResponse({ type: WebhookReceiptDto })
  @ApiBadRequestResponse({
    description: 'INVALID_WEBHOOK_SIGNATURE',
  })
  @ApiServiceUnavailableResponse({
    description: 'PAYMENTS_UNAVAILABLE: the webhook secret is not configured',
  })
  handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<WebhookReceiptDto> {
    return this.service.execute(request.rawBody, signature);
  }
}
