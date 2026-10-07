import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '100';
});

describe('Email login (e2e)', () => {
  let app: INestApplication<App>;
  let outbox: MailOutbox;
  const email = `email-login-${randomUUID()}@example.com`;

  function lastLoginEmail(): { code: string; token: string } {
    const message = outbox.lastTo(email);
    expect(message?.subject).toBe('Seu código de acesso ao EV ChargeOps');
    const text = message?.text ?? '';
    const code = /^(\d{6})$/m.exec(text)?.[1];
    const token = /\/login\/email\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
    if (!code || !token) {
      throw new Error('No login code or link sent');
    }
    return { code, token };
  }

  async function requestLogin(): Promise<{ code: string; token: string }> {
    await request(app.getHttpServer())
      .post('/auth/email-login/request')
      .send({ email: email.toUpperCase() })
      .expect(202);
    return lastLoginEmail();
  }

  function verify(payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/auth/email-login/verify')
      .send(payload);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    outbox = app.get(MailOutbox);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Passwordless', email, password: 'some-password-123' })
      .expect(201);
  });

  afterAll(async () => {
    await app.get(PrismaService).user.deleteMany({ where: { email } });
    await app.close();
  });

  it('accepts unknown emails without sending anything', async () => {
    const unknown = `unknown-${randomUUID()}@example.com`;

    await request(app.getHttpServer())
      .post('/auth/email-login/request')
      .send({ email: unknown })
      .expect(202);

    expect(outbox.lastTo(unknown)).toBeUndefined();
  });

  it('logs in with email and code once', async () => {
    const { code } = await requestLogin();

    const session = await verify({ email, code }).expect(200);
    expect(session.body).toEqual({
      user: {
        id: expect.any(String),
        name: 'Passwordless',
        email,
        role: 'DRIVER',
        emailVerified: true,
        hasPassword: true,
        paymentMode: 'TEST',
        locationMode: 'DEMO',
        autoRefund: false,
      },
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .expect(200);
    await verify({ email, code }).expect(401);
  });

  it('logs in with the magic link token once', async () => {
    const { token } = await requestLogin();

    const session = await verify({ token }).expect(200);
    expect(session.body.user.email).toBe(email);

    await verify({ token }).expect(401);
  });

  it('locks the code and the link after five wrong codes', async () => {
    const { code, token } = await requestLogin();
    const wrongCode = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verify({ email, code: wrongCode }).expect(401);
    }

    await verify({ email, code }).expect(401);
    await verify({ token }).expect(401);
  });

  it('invalidates the previous code when a new one is requested', async () => {
    const first = await requestLogin();
    const second = await requestLogin();

    await verify({ token: first.token }).expect(401);
    await verify({ email, code: second.code }).expect(200);
  });

  it('accepts exactly one credential form', async () => {
    await verify({}).expect(400);
    await verify({ email }).expect(400);
    await verify({ token: 'x', email, code: '123456' }).expect(400);
    await verify({ email, code: '12ab56' }).expect(400);
  });
});
