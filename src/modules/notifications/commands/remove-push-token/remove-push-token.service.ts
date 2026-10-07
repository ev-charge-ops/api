import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from '../../database/notifications.repository.port.js';

@Injectable()
export class RemovePushTokenService {
  constructor(private readonly repository: NotificationsRepository) {}

  execute(userId: string, token: string): Promise<void> {
    return this.repository.removeToken(userId, token);
  }
}
