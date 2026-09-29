import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../../generated/prisma/enums.js';
import type {
  NotificationData,
  NotificationRecord,
} from '../database/notifications.repository.port.js';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type: NotificationType;

  @ApiProperty({ example: 'Recarga concluída' })
  title: string;

  @ApiProperty({
    example:
      'Seu veículo no ponto Vaga L1-01 terminou de carregar. Você tem 10 minutos de tolerância para liberar a vaga.',
  })
  body: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      sessionId: '6f1c0f7e-2c1a-4a43-9b8e-2a4d1c0e9f10',
      chargePointId: '0c5d8a2e-77b1-4c39-8f0e-9d6f1b2a3c4d',
      chargePointName: 'Vaga L1-01',
      graceEndsAt: '2026-10-07T22:40:00.000Z',
      gracePeriodMinutes: 10,
    },
    description:
      'Payload for navigation; session notifications carry sessionId, chargePointId and chargePointName',
  })
  data: NotificationData;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromRecord(record: NotificationRecord): NotificationResponseDto {
    return Object.assign(new NotificationResponseDto(), {
      id: record.id,
      type: record.type,
      title: record.title,
      body: record.body,
      data: record.data,
      readAt: record.readAt,
      createdAt: record.createdAt,
    });
  }
}
