import { ApiProperty } from '@nestjs/swagger';
import { QueueEntryStatus } from '../../../../generated/prisma/enums.js';
import type { QueueEntryRecord } from '../queue-rules.js';

export class QueueEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  chargePointId: string;

  @ApiProperty({
    enum: QueueEntryStatus,
    enumName: 'QueueEntryStatus',
    description:
      'WAITING in line, NOTIFIED when it is your turn and the point is reserved until reservedUntil, EXPIRED when the reservation ran out, LEFT when you left, FULFILLED when you started a session',
  })
  status: QueueEntryStatus;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2,
    description: 'Position in line starting at 1, null once the entry ended',
  })
  position: number | null;

  @ApiProperty({ example: 3, description: 'People in line at this point' })
  queueLength: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'End of your reservation while NOTIFIED',
  })
  reservedUntil: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  notifiedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromRecord(
    entry: QueueEntryRecord,
    position: number | null,
    queueLength: number,
  ): QueueEntryResponseDto {
    return Object.assign(new QueueEntryResponseDto(), {
      id: entry.id,
      chargePointId: entry.chargePointId,
      status: entry.status,
      position,
      queueLength,
      reservedUntil: entry.reservedUntil,
      notifiedAt: entry.notifiedAt,
      endedAt: entry.endedAt,
      createdAt: entry.createdAt,
    });
  }
}
