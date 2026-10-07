import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../../config/env.schema.js';
import { ConsoleMailSender } from './console-mail-sender.js';
import { MailOutbox } from './mail-outbox.js';
import { MailSender } from './mail-sender.js';
import { ResendMailSender } from './resend-mail-sender.js';

export function createMailSender(
  config: ConfigService<Env, true>,
  outbox: MailOutbox,
): MailSender {
  const from = config.get('MAIL_FROM', { infer: true });
  if (config.get('MAIL_DRIVER', { infer: true }) === 'resend') {
    return new ResendMailSender(
      new Resend(config.get('RESEND_API_KEY', { infer: true })),
      from,
    );
  }
  return new ConsoleMailSender(outbox, from);
}

@Module({
  providers: [
    MailOutbox,
    {
      provide: MailSender,
      inject: [ConfigService, MailOutbox],
      useFactory: createMailSender,
    },
  ],
  exports: [MailSender, MailOutbox],
})
export class MailModule {}
