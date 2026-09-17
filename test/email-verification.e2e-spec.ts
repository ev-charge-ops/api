import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';

function extractToken(outbox: MailOutbox, email: string): string {
  const text = outbox.lastTo(email)?.text ?? '';
  const match = /\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) {
    throw new Error(`No verification link sent to ${email}`);
  }
  return match[1];
}

describe('Email verification (e2e)', () => {
  let app: INestApplication<App>;
  let outbox: MailOutbox;
  const email = `verify-${randomUUID()}@example.com`;
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    outbox = app.get(MailOutbox);
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
  });

  it('verifies the email through the link sent on registration', async () => {
    const server = app.getHttpServer();

    const registered = await request(server)
      .post('/auth/register')
      .send({ name: 'Verifier', email, password })
      .expect(201);
    expect(registered.body.user.emailVerified).toBe(false);
    const auth = `Bearer ${registered.body.accessToken}`;

    const firstToken = extractToken(outbox, email);
    expect(outbox.lastTo(email)?.subject).toBe(
      'Confirme seu e-mail no EV ChargeOps',
    );

    await request(server)
      .post('/auth/email-verification/resend')
      .set('Authorization', auth)
      .expect(202);
    const secondToken = extractToken(outbox, email);
    expect(secondToken).not.toBe(firstToken);

    await request(server)
      .post('/auth/email-verification/confirm')
      .send({ token: firstToken })
      .expect(400);

    await request(server)
      .post('/auth/email-verification/confirm')
      .send({ token: secondToken })
      .expect(204);

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', auth)
      .expect(200);
    expect(me.body.emailVerified).toBe(true);

    await request(server)
      .post('/auth/email-verification/confirm')
      .send({ token: secondToken })
      .expect(400);

    const sentBefore = outbox.messages.length;
    await request(server)
      .post('/auth/email-verification/resend')
      .set('Authorization', auth)
      .expect(202);
    expect(outbox.messages.length).toBe(sentBefore);
  });

  it('requires authentication to resend', () => {
    return request(app.getHttpServer())
      .post('/auth/email-verification/resend')
      .expect(401);
  });

  it('validates the confirmation payload', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/auth/email-verification/confirm')
      .send({})
      .expect(400);
    await request(server)
      .post('/auth/email-verification/confirm')
      .send({ token: 'unknown-token' })
      .expect(400);
  });
});
