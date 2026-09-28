import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { PrivacyRepository } from '../../database/privacy.repository.port.js';
import {
  type ConsentChoice,
  consentChanges,
  type ConsentEntry,
  consentState,
  CURRENT_TERMS_VERSION,
  RequiredConsentError,
} from '../../domain/consent-purposes.js';
import { MyConsentsResponseDto } from '../../dto/my-consents.response.dto.js';
import { PrivacyErrorCode, privacyError } from '../../privacy-errors.js';
import type { UpdateMyConsentsRequestDto } from './update-my-consents.request.dto.js';

@Injectable()
export class UpdateMyConsentsService {
  constructor(
    private readonly repository: PrivacyRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    dto: UpdateMyConsentsRequestDto,
  ): Promise<MyConsentsResponseDto> {
    if (dto.termsVersion !== CURRENT_TERMS_VERSION) {
      throw privacyError(
        HttpStatus.CONFLICT,
        PrivacyErrorCode.TERMS_VERSION_OUTDATED,
        `The current terms version is ${CURRENT_TERMS_VERSION}`,
      );
    }
    const entries = await this.repository.findConsents(userId);
    await this.repository.recordConsents(
      userId,
      changesFor(entries, dto.consents),
      CURRENT_TERMS_VERSION,
      this.clock.now(),
    );
    return MyConsentsResponseDto.fromState(
      consentState(await this.repository.findConsents(userId)),
    );
  }
}

function changesFor(
  entries: ConsentEntry[],
  choices: ConsentChoice[],
): ConsentChoice[] {
  try {
    return consentChanges(entries, choices);
  } catch (error) {
    if (error instanceof RequiredConsentError) {
      throw privacyError(
        HttpStatus.BAD_REQUEST,
        PrivacyErrorCode.REQUIRED_CONSENT,
        `Required purposes cannot be revoked: ${error.purposes.join(', ')}`,
      );
    }
    throw error;
  }
}
