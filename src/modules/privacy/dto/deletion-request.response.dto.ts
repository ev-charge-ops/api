import { ApiProperty } from '@nestjs/swagger';
import { DeletionRequestStatus } from '../../../generated/prisma/enums.js';
import type { DeletionRequestRecord } from '../database/privacy.repository.port.js';

export class DeletionRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: DeletionRequestStatus,
    enumName: 'DeletionRequestStatus',
  })
  status: DeletionRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;

  @ApiProperty()
  requestedAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  processedAt: Date | null;
}

export function toDeletionRequestResponse(
  request: DeletionRequestRecord,
): DeletionRequestResponseDto {
  return Object.assign(new DeletionRequestResponseDto(), {
    id: request.id,
    status: request.status,
    reason: request.reason,
    requestedAt: request.createdAt,
    processedAt: request.processedAt,
  });
}
