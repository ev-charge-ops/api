import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { PrivacyRepository } from '../../database/privacy.repository.port.js';
import { toDeletionRequestResponse } from '../../dto/deletion-request.response.dto.js';
import { MyDataExportResponseDto } from './my-data-export.response.dto.js';

@Injectable()
export class ExportMyDataService {
  constructor(
    private readonly repository: PrivacyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<MyDataExportResponseDto> {
    const data = await this.repository.findUserData(userId);
    if (!data) {
      throw new NotFoundException('User not found');
    }
    return Object.assign(new MyDataExportResponseDto(), {
      exportedAt: this.clock.now(),
      profile: data.profile,
      memberships: data.memberships,
      sessions: data.sessions,
      consents: data.consents,
      deletionRequests: data.deletionRequests.map(toDeletionRequestResponse),
    });
  }
}
