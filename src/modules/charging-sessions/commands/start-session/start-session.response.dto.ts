import { ApiProperty } from '@nestjs/swagger';
import { PaymentSheetDto } from '../../dto/payment-sheet.dto.js';
import { SessionResponseDto } from '../../dto/session.response.dto.js';

export class StartSessionResponseDto extends SessionResponseDto {
  @ApiProperty({
    type: PaymentSheetDto,
    nullable: true,
    description:
      'Parameters for the Stripe PaymentSheet when the session is AWAITING_PAYMENT (commercial points), null otherwise',
  })
  paymentSheet: PaymentSheetDto | null;
}
