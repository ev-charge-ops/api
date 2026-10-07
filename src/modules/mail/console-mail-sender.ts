import { Logger } from '@nestjs/common';
import type { MailOutbox } from './mail-outbox.js';
import { MailSender, type MailMessage } from './mail-sender.js';

export class ConsoleMailSender extends MailSender {
  private readonly logger = new Logger(ConsoleMailSender.name);

  constructor(
    private readonly outbox: MailOutbox,
    private readonly from: string,
  ) {
    super();
  }

  send(message: MailMessage): Promise<void> {
    this.outbox.record(message);
    this.logger.log(
      [
        `From: ${this.from}`,
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        '',
        message.text,
      ].join('\n'),
    );
    return Promise.resolve();
  }
}
