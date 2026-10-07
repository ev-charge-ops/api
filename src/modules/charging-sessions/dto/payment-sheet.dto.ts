import { ApiProperty } from '@nestjs/swagger';

export class PaymentSheetDto {
  @ApiProperty({
    example: 'pi_3Q0abc123_secret_xyz',
    description: 'initPaymentSheet paymentIntentClientSecret',
  })
  paymentIntentClientSecret: string;

  @ApiProperty({
    example: 'cus_Q0abc123',
    description: 'initPaymentSheet customerId',
  })
  customerId: string;

  @ApiProperty({
    example: 'ek_test_abc123',
    description: 'initPaymentSheet customerEphemeralKeySecret',
  })
  customerEphemeralKeySecret: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'pk_test_abc123',
    description:
      'Stripe publishable key for initStripe, or null to use the key bundled with the app',
  })
  publishableKey: string | null;

  @ApiProperty({ example: 'EV ChargeOps' })
  merchantDisplayName: string;
}
