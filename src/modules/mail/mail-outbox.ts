import { Injectable } from '@nestjs/common';
import type { MailMessage } from './mail-sender.js';

const MAX_MESSAGES = 100;

@Injectable()
export class MailOutbox {
  private readonly sent: MailMessage[] = [];

  get messages(): readonly MailMessage[] {
    return this.sent;
  }

  record(message: MailMessage): void {
    this.sent.push(message);
    if (this.sent.length > MAX_MESSAGES) {
      this.sent.shift();
    }
  }

  lastTo(email: string): MailMessage | undefined {
    const recipient = email.toLowerCase();
    return this.sent.findLast(
      (message) => message.to.toLowerCase() === recipient,
    );
  }

  clear(): void {
    this.sent.length = 0;
  }
}
