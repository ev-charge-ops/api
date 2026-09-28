import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { PrivacyRepository } from '../../database/privacy.repository.port.js';
import {
  type DeletionRequestResponseDto,
  toDeletionRequestResponse,
} from '../../dto/deletion-request.response.dto.js';
import type { RequestAccountDeletionRequestDto } from './request-account-deletion.request.dto.js';

@Injectable()
export class RequestAccountDeletionService {
  constructor(
    private readonly repository: PrivacyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    dto: RequestAccountDeletionRequestDto,
  ): Promise<DeletionRequestResponseDto> {
    const request = await this.repository.requestDeletion(
      userId,
      dto.reason || null,
      this.clock.now(),
    );
    return toDeletionRequestResponse(request);
  }
}
