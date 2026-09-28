import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from '../../database/notifications.repository.port.js';
import { PushTokenResponseDto } from './push-token.response.dto.js';
import type { RegisterPushTokenRequestDto } from './register-push-token.request.dto.js';

@Injectable()
export class RegisterPushTokenService {
  constructor(private readonly repository: NotificationsRepository) {}

  async execute(
    userId: string,
    dto: RegisterPushTokenRequestDto,
  ): Promise<PushTokenResponseDto> {
    const saved = await this.repository.saveToken(
      userId,
      dto.token,
      dto.platform,
    );
    return Object.assign(new PushTokenResponseDto(), saved);
  }
}
