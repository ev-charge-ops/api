import { Injectable } from '@nestjs/common';
import type { PushMessage } from './push-sender.port.js';

const MAX_MESSAGES = 100;

@Injectable()
export class PushOutbox {
  private readonly sent: PushMessage[] = [];

  get messages(): readonly PushMessage[] {
    return this.sent;
  }

  record(message: PushMessage): void {
    this.sent.push(message);
    if (this.sent.length > MAX_MESSAGES) {
      this.sent.shift();
    }
  }

  sentTo(token: string): PushMessage[] {
    return this.sent.filter((message) => message.to === token);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
