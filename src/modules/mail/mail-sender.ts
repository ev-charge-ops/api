export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export abstract class MailSender {
  abstract send(message: MailMessage): Promise<void>;
}
