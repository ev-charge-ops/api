import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode, PaymentStatus } from '../../../generated/prisma/enums.js';

export class SessionPaymentDto {
  @ApiProperty({ example: 'pi_3Q0abc123' })
  paymentIntentId: string;

  @ApiProperty({
    enum: PaymentMode,
    enumName: 'PaymentMode',
    description:
      'Stripe mode of the payment, taken from the paymentMode of the driver when the session started',
  })
  mode: PaymentMode;

  @ApiProperty({
    enum: PaymentStatus,
    enumName: 'PaymentStatus',
    description:
      'PENDING_AUTHORIZATION until the card is confirmed, AUTHORIZED while the hold is active, CAPTURED with the final amount, CANCELED when the hold is released, FAILED when the card was declined (the driver may retry), REFUNDED when the captured amount was refunded in full (autoRefund accounts)',
  })
  status: PaymentStatus;

  @ApiProperty({ example: 'BRL' })
  currency: string;

  @ApiProperty({
    example: 20040,
    description: 'Amount held on the card (pre-authorization)',
  })
  authorizedCents: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1041,
    description: 'Final amount charged, set once captured',
  })
  capturedCents: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'card_declined',
    description: 'Decline code of the last failed attempt',
  })
  failureCode: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  authorizedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  capturedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  canceledAt: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1041,
    description: 'Amount refunded to the card, set once refunded',
  })
  refundedCents: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  refundedAt: Date | null;
}
