import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '2';
});

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

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

  it('applies the stricter limit to auth routes', async () => {
    const server = app.getHttpServer();
    const credentials = { email: 'nobody@example.com', password: 'whatever' };

    await request(server).post('/auth/login').send(credentials).expect(401);
    await request(server).post('/auth/login').send(credentials).expect(401);
    const limited = await request(server)
      .post('/auth/login')
      .send(credentials)
      .expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body).toMatchObject({ statusCode: 429 });
  });

  it('counts each auth route separately', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({})
      .expect(400);
  });

  it('applies the stricter limit to password changes', async () => {
    const server = app.getHttpServer();
    const body = { newPassword: 'whatever-123' };

    await request(server).post('/me/password').send(body).expect(401);
    await request(server).post('/me/password').send(body).expect(401);
    await request(server).post('/me/password').send(body).expect(429);
  });

  it('keeps the default limit on other routes', async () => {
    const server = app.getHttpServer();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(server).get('/').expect(200);
    }
  });
});
