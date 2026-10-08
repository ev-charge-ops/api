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
      'DELETE /charge-points/{chargePointId}/queue leaveChargePointQueue',
      'DELETE /me/push-tokens/{token} removePushToken',
      'DELETE /organizations/{organizationId}/invites/{inviteId} revokeInvite',
      'GET /auth/me getMe',
      'GET /charge-points listChargePoints',
      'GET /charge-points/{chargePointId} getChargePoint',
      'GET /charge-points/{chargePointId}/queue/me getMyQueueEntry',
      'GET /invites/{token} getInvitePreview',
      'GET /me/consents getMyConsents',
      'GET /me/data-export exportMyData',
      'GET /me/notifications listMyNotifications',
      'GET /me/organizations listMyOrganizations',
      'GET /organizations/{organizationId}/invites listInvites',
      'GET /organizations/{organizationId}/members listOrganizationMembers',
      'GET /organizations/{organizationId}/overview getOrganizationOverview',
      'GET /organizations/{organizationId}/sessions listOrganizationSessions',
      'GET /organizations/{organizationId}/sessions/{sessionId} getOrganizationSession',
      'GET /organizations/{organizationId}/statements getMonthlyStatement',
      'GET /organizations/{organizationId}/statements/export.csv exportMonthlyStatementCsv',
      'GET /organizations/{organizationId}/tariff getOrganizationTariff',
      'GET /sessions listMySessions',
      'GET /sessions/active getActiveSession',
      'GET /sessions/{sessionId} getSession',
      'PATCH /me updateMyProfile',
      'PATCH /organizations/{organizationId}/tariff updateOrganizationTariff',
      'POST /auth/email-login/request requestEmailLogin',
      'POST /auth/email-login/verify verifyEmailLogin',
      'POST /auth/email-verification/confirm confirmEmailVerification',
      'POST /auth/email-verification/resend resendEmailVerification',
      'POST /auth/login login',
      'POST /auth/logout logout',
      'POST /auth/oauth/apple loginWithApple',
      'POST /auth/oauth/google loginWithGoogle',
      'POST /auth/oauth/google/code loginWithGoogleCode',
      'POST /auth/password/forgot forgotPassword',
      'POST /auth/password/reset resetPassword',
      'POST /auth/refresh refresh',
      'POST /auth/register register',
      'POST /charge-points/{chargePointId}/queue joinChargePointQueue',
      'POST /invites/{token}/accept acceptInvite',
      'POST /invites/{token}/accept-authenticated acceptInviteAsCurrentUser',
      'POST /me/deletion-request requestAccountDeletion',
      'POST /me/notifications/read-all markAllNotificationsRead',
      'POST /me/notifications/{notificationId}/read markNotificationRead',
      'POST /me/password changeMyPassword',
      'POST /me/push-tokens registerPushToken',
      'POST /organizations/{organizationId}/invites createInvite',
      'POST /organizations/{organizationId}/invites/{inviteId}/resend resendInvite',
      'POST /payments/stripe/webhook handleStripeWebhook',
      'POST /sessions startSession',
      'POST /sessions/{sessionId}/payment/confirm confirmSessionPayment',
      'POST /sessions/{sessionId}/payment/sheet createSessionPaymentSheet',
      'POST /sessions/{sessionId}/stop stopSession',
      'PUT /me/consents updateMyConsents',
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
