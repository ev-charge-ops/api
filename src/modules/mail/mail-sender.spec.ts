import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { ConsoleMailSender } from './console-mail-sender.js';
import { createMailSender } from './mail.module.js';
import { MailOutbox } from './mail-outbox.js';
import type { MailMessage } from './mail-sender.js';
import { ResendMailSender } from './resend-mail-sender.js';

const FROM = 'EV ChargeOps <noreply@evchargeops.com.br>';

function message(to: string, subject = 'Assunto'): MailMessage {
  return { to, subject, html: '<p>Oi</p>', text: 'Oi' };
}

function configWith(values: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

describe('MailOutbox', () => {
  it('finds the last message sent to a recipient ignoring case', () => {
    const outbox = new MailOutbox();
    outbox.record(message('ana@example.com', 'first'));
    outbox.record(message('bob@example.com', 'other'));
    outbox.record(message('ana@example.com', 'second'));

    expect(outbox.lastTo('ANA@example.com')?.subject).toBe('second');
    expect(outbox.lastTo('nobody@example.com')).toBeUndefined();
  });

  it('keeps only the most recent messages', () => {
    const outbox = new MailOutbox();
    for (let index = 0; index < 150; index += 1) {
      outbox.record(message(`user-${index}@example.com`));
    }

    expect(outbox.messages).toHaveLength(100);
    expect(outbox.messages[0].to).toBe('user-50@example.com');
  });

  it('clears recorded messages', () => {
    const outbox = new MailOutbox();
    outbox.record(message('ana@example.com'));

    outbox.clear();

    expect(outbox.messages).toHaveLength(0);
  });
});

describe('ConsoleMailSender', () => {
  it('records the message in the outbox without network calls', async () => {
    const outbox = new MailOutbox();
    const sender = new ConsoleMailSender(outbox, FROM);

    await sender.send(message('ana@example.com'));

    expect(outbox.messages).toEqual([message('ana@example.com')]);
  });
});

describe('ResendMailSender', () => {
  it('sends the message through the Resend client', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ data: { id: 'email-id' }, error: null });
    const sender = new ResendMailSender({ emails: { send } } as never, FROM);

    await sender.send(message('ana@example.com'));

    expect(send).toHaveBeenCalledWith({
      from: FROM,
      to: 'ana@example.com',
      subject: 'Assunto',
      html: '<p>Oi</p>',
      text: 'Oi',
    });
  });

  it('throws when Resend returns an error', async () => {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'Invalid from',
        statusCode: 422,
      },
    });
    const sender = new ResendMailSender({ emails: { send } } as never, FROM);

    await expect(sender.send(message('ana@example.com'))).rejects.toThrow(
      /validation_error: Invalid from/,
    );
  });
});

describe('createMailSender', () => {
  it('uses the console sender by default', () => {
    const sender = createMailSender(
      configWith({ MAIL_DRIVER: 'console', MAIL_FROM: FROM }),
      new MailOutbox(),
    );
    expect(sender).toBeInstanceOf(ConsoleMailSender);
  });

  it('uses the Resend sender when configured', () => {
    const sender = createMailSender(
      configWith({
        MAIL_DRIVER: 'resend',
        MAIL_FROM: FROM,
        RESEND_API_KEY: 're_test_key',
      }),
      new MailOutbox(),
    );
    expect(sender).toBeInstanceOf(ResendMailSender);
  });
});
