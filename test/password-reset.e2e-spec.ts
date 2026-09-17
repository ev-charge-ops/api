import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { hashToken } from './../src/modules/auth/refresh-token.service.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let outbox: MailOutbox;
  let prisma: PrismaService;
  const email = `reset-${randomUUID()}@example.com`;
  const oldPassword = 'old-password-123';
  const newPassword = 'new-password-456';

  function lastResetToken(): string {
    const message = outbox.lastTo(email);
    expect(message?.subject).toBe('Redefina sua senha do EV ChargeOps');
    const match = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(
      message?.text ?? '',
    );
    if (!match) {
      throw new Error('No reset link sent');
    }
    return match[1];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    outbox = app.get(MailOutbox);
    prisma = app.get(PrismaService);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Resetter', email, password: oldPassword })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('accepts unknown emails without sending anything', async () => {
    const unknown = `unknown-${randomUUID()}@example.com`;

    await request(app.getHttpServer())
      .post('/auth/password/forgot')
      .send({ email: unknown })
      .expect(202);

    expect(outbox.lastTo(unknown)).toBeUndefined();
  });

  it('resets the password and revokes existing sessions', async () => {
    const server = app.getHttpServer();
    const session = await request(server)
      .post('/auth/login')
      .send({ email, password: oldPassword })
      .expect(200);
    expect(session.body.user.emailVerified).toBe(false);

    await request(server)
      .post('/auth/password/forgot')
      .send({ email: email.toUpperCase() })
      .expect(202);
    const token = lastResetToken();

    await request(server)
      .post('/auth/password/reset')
      .send({ token, password: 'short' })
      .expect(400);

    await request(server)
      .post('/auth/password/reset')
      .send({ token, password: newPassword })
      .expect(204);

    await request(server)
      .post('/auth/password/reset')
      .send({ token, password: 'another-password-789' })
      .expect(400);

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.body.refreshToken })
      .expect(401);

    await request(server)
      .post('/auth/login')
      .send({ email, password: oldPassword })
      .expect(401);

    const loggedIn = await request(server)
      .post('/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
    expect(loggedIn.body.user.emailVerified).toBe(true);
  });

  it('invalidates the previous link when a new one is requested', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/auth/password/forgot')
      .send({ email })
      .expect(202);
    const first = lastResetToken();
    await request(server)
      .post('/auth/password/forgot')
      .send({ email })
      .expect(202);
    const second = lastResetToken();

    expect(second).not.toBe(first);
    await request(server)
      .post('/auth/password/reset')
      .send({ token: first, password: newPassword })
      .expect(400);
  });

  it('rejects an expired token', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/auth/password/forgot')
      .send({ email })
      .expect(202);
    const token = lastResetToken();
    await prisma.oneTimeToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(server)
      .post('/auth/password/reset')
      .send({ token, password: newPassword })
      .expect(400);
  });
});
