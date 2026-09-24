import { ApiProperty } from '@nestjs/swagger';

export class WebhookReceiptDto {
  @ApiProperty({ example: true })
  received: boolean;

  @ApiProperty({
    example: true,
    description:
      'False when the event type is ignored or was already processed',
  })
  processed: boolean;
}
