import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupSwagger } from './../src/common/swagger/setup-swagger.js';

describe('OpenAPI docs (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the OpenAPI document with stable operation ids', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    const operations = Object.entries(
      response.body.paths as Record<
        string,
        Record<string, { operationId: string }>
      >,
    ).flatMap(([path, methods]) =>
      Object.entries(methods).map(
        ([method, operation]) =>
          `${method.toUpperCase()} ${path} ${operation.operationId}`,
      ),
    );
    expect(operations.sort()).toEqual([
      'GET /auth/me getMe',
      'POST /auth/email-verification/confirm confirmEmailVerification',
      'POST /auth/email-verification/resend resendEmailVerification',
      'POST /auth/login login',
      'POST /auth/logout logout',
      'POST /auth/password/forgot forgotPassword',
      'POST /auth/password/reset resetPassword',
      'POST /auth/refresh refresh',
      'POST /auth/register register',
    ]);
    expect(response.body.components.securitySchemes).toHaveProperty('bearer');
    expect(response.body.components.schemas.Role).toEqual({
      type: 'string',
      enum: ['DRIVER', 'MANAGER'],
    });
  });

  it('serves the Swagger UI', () => {
    return request(app.getHttpServer())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /html/);
  });
});
