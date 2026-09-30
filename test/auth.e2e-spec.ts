import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `driver-${randomUUID()}@example.com`;
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app
      .get(PrismaService)
      .user.deleteMany({ where: { email: { in: [email] } } });
    await app.close();
  });

  it('runs the full session lifecycle', async () => {
    const server = app.getHttpServer();

    const registered = await request(server)
      .post('/auth/register')
      .send({ name: 'Driver', email: email.toUpperCase(), password })
      .expect(201);
    expect(registered.body).toEqual({
      user: {
        id: expect.any(String),
        name: 'Driver',
        email,
        role: 'DRIVER',
        emailVerified: false,
        hasPassword: true,
      },
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    await request(server)
      .post('/auth/register')
      .send({ name: 'Driver', email, password })
      .expect(409);

    const loggedIn = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(loggedIn.body.user).toEqual(registered.body.user);

    const me = await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${loggedIn.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual(registered.body.user);

    const refreshed = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: loggedIn.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(loggedIn.body.refreshToken);
    expect(refreshed.body.user).toEqual(registered.body.user);

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: loggedIn.body.refreshToken })
      .expect(401);

    await request(server)
      .post('/auth/logout')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(204);

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('rejects /auth/me without a token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects /auth/me with an invalid token', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    const server = app.getHttpServer();
    const wrongPassword = await request(server)
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await request(server)
      .post('/auth/login')
      .send({ email: `unknown-${randomUUID()}@example.com`, password })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('validates the registration payload', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({ name: 'Driver', email: 'not-an-email', password })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({ name: 'Driver', email, password: 'short' })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({ name: 'Driver', email, password, role: 'MANAGER' })
      .expect(400);
  });
});
