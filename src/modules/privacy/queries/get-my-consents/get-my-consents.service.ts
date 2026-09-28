import { Injectable } from '@nestjs/common';
import { PrivacyRepository } from '../../database/privacy.repository.port.js';
import { consentState } from '../../domain/consent-purposes.js';
import { MyConsentsResponseDto } from '../../dto/my-consents.response.dto.js';

@Injectable()
export class GetMyConsentsService {
  constructor(private readonly repository: PrivacyRepository) {}

  async execute(userId: string): Promise<MyConsentsResponseDto> {
    const entries = await this.repository.findConsents(userId);
    return MyConsentsResponseDto.fromState(consentState(entries));
  }
}
