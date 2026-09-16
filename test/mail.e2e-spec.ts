import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { ConsoleMailSender } from './../src/modules/mail/console-mail-sender.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';
import { MailSender } from './../src/modules/mail/mail-sender.js';
import { verifyEmail } from './../src/modules/mail/templates/verify-email.js';

describe('Mail (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('delivers emails to the in-memory outbox with the console driver', async () => {
    const sender = app.get(MailSender);
    const outbox = app.get(MailOutbox);
    expect(sender).toBeInstanceOf(ConsoleMailSender);

    await sender.send({
      to: 'ana@example.com',
      ...verifyEmail({
        name: 'Ana',
        url: 'http://localhost:5173/verify-email?token=abc',
        expiresInMinutes: 1440,
      }),
    });

    expect(outbox.lastTo('ana@example.com')?.subject).toBe(
      'Confirme seu e-mail no EV ChargeOps',
    );
  });
});
