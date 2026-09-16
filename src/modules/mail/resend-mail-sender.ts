import type { Resend } from 'resend';
import { MailSender, type MailMessage } from './mail-sender.js';

export class ResendMailSender extends MailSender {
  constructor(
    private readonly client: Pick<Resend, 'emails'>,
    private readonly from: string,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(
        `Resend rejected the email: ${error.name}: ${error.message}`,
      );
    }
  }
}
