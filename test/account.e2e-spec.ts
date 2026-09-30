import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '100';
});

describe('Account (e2e)', () => {
  let app: INestApplication<App>;
  let outbox: MailOutbox;
  let prisma: PrismaService;
  const email = `account-${randomUUID()}@example.com`;
  const passwordlessEmail = `account-passwordless-${randomUUID()}@example.com`;
  const password = 'account-password-1';

  function server() {
    return app.getHttpServer();
  }

  function login(withPassword: string) {
    return request(server())
      .post('/auth/login')
      .send({ email, password: withPassword });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    outbox = app.get(MailOutbox);
    prisma = app.get(PrismaService);

    await request(server())
      .post('/auth/register')
      .send({ name: 'Account Owner', email, password })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [email, passwordlessEmail] } },
    });
    await app.close();
  });

  it('requires authentication', async () => {
    await request(server()).patch('/me').send({ name: 'Nobody' }).expect(401);
    await request(server())
      .post('/me/password')
      .send({ newPassword: 'whatever-123' })
      .expect(401);
  });

  it('updates the name and reflects it in /auth/me', async () => {
    const session = await login(password).expect(200);
    const authorization = `Bearer ${session.body.accessToken}`;

    const updated = await request(server())
      .patch('/me')
      .set('Authorization', authorization)
      .send({ name: '  Ana Atualizada  ' })
      .expect(200);
    expect(updated.body).toEqual({
      id: session.body.user.id,
      name: 'Ana Atualizada',
      email,
      role: 'DRIVER',
      emailVerified: false,
      hasPassword: true,
    });

    const me = await request(server())
      .get('/auth/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(me.body).toEqual(updated.body);
  });

  it.each([
    [{ name: ' A ' }],
    [{ name: 'x'.repeat(101) }],
    [{}],
    [{ name: 'Ana', email: 'other@example.com' }],
  ])('rejects the invalid profile %j', async (body) => {
    const session = await login(password).expect(200);

    await request(server())
      .patch('/me')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .send(body)
      .expect(400);
  });

  it('rejects a wrong or missing current password', async () => {
    const session = await login(password).expect(200);
    const authorization = `Bearer ${session.body.accessToken}`;

    for (const body of [
      { currentPassword: 'wrong-password-1', newPassword: 'new-password-2' },
      { newPassword: 'new-password-2' },
    ]) {
      const response = await request(server())
        .post('/me/password')
        .set('Authorization', authorization)
        .send(body)
        .expect(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    await request(server())
      .post('/me/password')
      .set('Authorization', authorization)
      .send({ currentPassword: password, newPassword: 'short' })
      .expect(400);

    await login(password).expect(200);
  });

  it('changes the password, rotates every session and emails the user', async () => {
    const other = await login(password).expect(200);
    const current = await login(password).expect(200);
    outbox.clear();

    const changed = await request(server())
      .post('/me/password')
      .set('Authorization', `Bearer ${current.body.accessToken}`)
      .send({ currentPassword: password, newPassword: 'changed-password-2' })
      .expect(200);
    expect(changed.body).toEqual({
      user: expect.objectContaining({ email, hasPassword: true }),
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    for (const refreshToken of [
      other.body.refreshToken,
      current.body.refreshToken,
    ]) {
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    }
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: changed.body.refreshToken })
      .expect(200);

    await login(password).expect(401);
    await login('changed-password-2').expect(200);

    const message = outbox.lastTo(email);
    expect(message?.subject).toBe('Sua senha foi alterada');
    expect(message?.html).toContain('Senha alterada');
    expect(message?.text).toContain('/forgot-password');
  });

  it('lets an account without a password create one', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Google Only',
        email: passwordlessEmail,
        emailVerifiedAt: new Date(),
      },
    });
    const accessToken = await app
      .get(JwtService)
      .signAsync({ sub: user.id, role: user.role });
    const me = await request(server())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.hasPassword).toBe(false);

    const created = await request(server())
      .post('/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPassword: 'first-password-1' })
      .expect(200);
    expect(created.body.user.hasPassword).toBe(true);

    await request(server())
      .post('/auth/login')
      .send({ email: passwordlessEmail, password: 'first-password-1' })
      .expect(200);
  });
});
