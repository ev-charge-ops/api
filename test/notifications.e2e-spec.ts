import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';
import {
  MOCK_VEHICLE,
  mockTelemetry,
} from './../src/modules/charger-gateway/adapters/mock-charger.adapter.js';
import { ChargerGateway } from './../src/modules/charger-gateway/charger-gateway.port.js';
import { PushOutbox } from './../src/modules/notifications/push/push-outbox.js';
import { FakePaymentGateway } from './../src/modules/payments/adapters/fake-payment.adapter.js';
import { DisabledPaymentGateway } from './../src/modules/payments/payment-gateway.port.js';
import { PaymentGateways } from './../src/modules/payments/payment-gateways.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  process.env.CHARGER_DRIVER = 'mock';
  process.env.SIMULATION_SPEED = '60';
  process.env.PUSH_DRIVER = 'console';
});

interface Session {
  id: string;
  email: string;
  accessToken: string;
}

interface NotificationBody {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
}

const SPEED = 60;
const START = new Date('2026-10-07T10:00:00.000-03:00');
const LATER = new Date('2026-10-07T12:00:00.000-03:00');
const TARIFF_START = new Date('2026-01-01T00:00:00.000-03:00');
const IDLE_TERMS = {
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
};

function plusSimulatedMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + (minutes * 60_000) / SPEED);
}

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let outbox: PushOutbox;
  let now = START;
  const clock = { now: () => now };
  const run = randomUUID();
  const emails: string[] = [];
  const payments = new FakePaymentGateway();
  const driverToken = `ExponentPushToken[driver-${run}]`;
  const visitorToken = `ExpoPushToken[visitor-${run}]`;
  let organizationId: string;
  let manager: Session;
  let driver: Session;
  let visitor: Session;
  let privatePointId: string;
  let visitorsPointId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'notify-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      email,
      accessToken: response.body.accessToken,
    };
  }

  function as(session: Session) {
    const server = app.getHttpServer();
    const auth = `Bearer ${session.accessToken}`;
    return {
      get: (path: string) =>
        request(server).get(path).set('Authorization', auth),
      post: (path: string, body?: object) =>
        request(server).post(path).set('Authorization', auth).send(body),
      delete: (path: string) =>
        request(server).delete(path).set('Authorization', auth),
    };
  }

  async function notificationsOf(
    session: Session,
  ): Promise<NotificationBody[]> {
    const response = await as(session)
      .get('/me/notifications?pageSize=100')
      .expect(200);
    return response.body.items;
  }

  async function typesOf(session: Session): Promise<string[]> {
    return (await notificationsOf(session)).map((item) => item.type).reverse();
  }

  function pushedTitles(token: string): string[] {
    return outbox.sentTo(token).map((message) => message.title);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(PaymentGateways)
      .useValue(
        new PaymentGateways({
          TEST: payments,
          LIVE: new DisabledPaymentGateway(),
        }),
      )
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(PushOutbox);

    manager = await register('Marta');
    driver = await register('Diego');
    visitor = await register('Vera');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: [
            { userId: manager.id, role: 'MANAGER' },
            { userId: driver.id, role: 'DRIVER', unitLabel: 'D · 4' },
          ],
        },
        tariffs: {
          create: {
            utilityRateCents: 89,
            accessFeeCents: 3500,
            validFrom: TARIFF_START,
            ...IDLE_TERMS,
          },
        },
      },
    });
    organizationId = organization.id;
    const createPoint = (code: string, type: 'PRIVATE' | 'COMMERCIAL') =>
      prisma.chargePoint.create({
        data: {
          organizationId,
          code,
          name: `Vaga ${code}`,
          type,
          latitude: -23.569,
          longitude: -46.631,
          maxPowerKw: 7,
          chargers: {
            create: {
              vendor: 'GoodWe HCA G2',
              serialNumber: `${code}-${run}`,
            },
          },
        },
      });
    privatePointId = (await createPoint('N1-01', 'PRIVATE')).id;
    visitorsPointId = (await createPoint('N2-01', 'COMMERCIAL')).id;
    await prisma.tariff.create({
      data: {
        organizationId,
        chargePointId: visitorsPointId,
        utilityRateCents: 89,
        baseRateCents: 189,
        accessFeeCents: 0,
        validFrom: TARIFF_START,
        ...IDLE_TERMS,
      },
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('requires authentication', async () => {
    const server = app.getHttpServer();
    await request(server).get('/me/notifications').expect(401);
    await request(server).post('/me/notifications/read-all').expect(401);
    await request(server).post('/me/push-tokens').send({}).expect(401);
    await request(server)
      .delete(`/me/push-tokens/${encodeURIComponent(driverToken)}`)
      .expect(401);
  });

  it('registers Expo push tokens and moves them between accounts', async () => {
    await as(driver)
      .post('/me/push-tokens', { token: 'not-a-token', platform: 'ANDROID' })
      .expect(400);
    await as(driver)
      .post('/me/push-tokens', { token: driverToken, platform: 'WINDOWS' })
      .expect(400);

    const registered = await as(visitor)
      .post('/me/push-tokens', { token: driverToken, platform: 'IOS' })
      .expect(200);
    expect(registered.body).toMatchObject({
      token: driverToken,
      platform: 'IOS',
    });

    const moved = await as(driver)
      .post('/me/push-tokens', { token: driverToken, platform: 'ANDROID' })
      .expect(200);
    expect(moved.body).toMatchObject({ platform: 'ANDROID' });
    const stored = await prisma.pushToken.findUniqueOrThrow({
      where: { token: driverToken },
    });
    expect(stored.userId).toBe(driver.id);

    await as(visitor)
      .post('/me/push-tokens', { token: visitorToken, platform: 'IOS' })
      .expect(200);
    expect(
      await prisma.pushToken.count({ where: { userId: visitor.id } }),
    ).toBe(1);
  });

  it('removes a push token of the user only', async () => {
    const spare = `ExponentPushToken[spare-${run}]`;
    await as(driver)
      .post('/me/push-tokens', { token: spare, platform: 'ANDROID' })
      .expect(200);

    await as(visitor)
      .delete(`/me/push-tokens/${encodeURIComponent(spare)}`)
      .expect(204);
    expect(await prisma.pushToken.count({ where: { token: spare } })).toBe(1);

    await as(driver)
      .delete(`/me/push-tokens/${encodeURIComponent(spare)}`)
      .expect(204);
    await as(driver)
      .delete(`/me/push-tokens/${encodeURIComponent(spare)}`)
      .expect(204);
    expect(await prisma.pushToken.count({ where: { token: spare } })).toBe(0);
  });

  it('notifies each step of a private session once', async () => {
    outbox.clear();
    const started = await as(driver)
      .post('/sessions', { chargePointId: privatePointId })
      .expect(201);
    const sessionId: string = started.body.id;
    expect(started.body).toMatchObject({
      status: 'ACTIVE',
      graceEndsAt: null,
      idleStartsAt: null,
      idleFeeCapReachedAt: null,
    });

    await as(driver).get(`/sessions/${sessionId}`).expect(200);
    await as(driver).get('/sessions/active').expect(200);
    expect(await typesOf(driver)).toEqual(['SESSION_ACTIVE']);
    expect(pushedTitles(driverToken)).toEqual(['Carregador liberado']);
    expect(outbox.sentTo(driverToken)[0].data).toMatchObject({
      type: 'SESSION_ACTIVE',
      sessionId,
      chargePointId: privatePointId,
      chargePointName: 'Vaga N1-01',
      notificationId: expect.any(String),
    });

    const { completedAt } = mockTelemetry(
      {
        chargerSerialNumber: 'N1-01',
        transactionId: 'tx',
        startedAt: START,
        allocatedPowerKw: 7,
        targetEnergyWh: 29_000,
        batteryCapacityWh: MOCK_VEHICLE.batteryCapacityWh,
        initialSocPercent: MOCK_VEHICLE.socPercent,
        timeScale: SPEED,
      },
      { since: START, until: plusSimulatedMinutes(START, 600) },
    );
    const fullAt = completedAt!;
    const graceEndsAt = plusSimulatedMinutes(fullAt, 10).toISOString();

    now = plusSimulatedMinutes(fullAt, 2);
    const grace = await as(driver).get(`/sessions/${sessionId}`).expect(200);
    expect(grace.body).toMatchObject({
      status: 'GRACE',
      graceEndsAt,
      idleStartsAt: graceEndsAt,
      idleFeeCapReachedAt: plusSimulatedMinutes(fullAt, 130).toISOString(),
    });
    await as(driver).get(`/sessions/${sessionId}`).expect(200);
    const [complete] = await notificationsOf(driver);
    expect(complete).toMatchObject({
      type: 'CHARGING_COMPLETE',
      title: 'Recarga concluída',
      body: 'Seu veículo no ponto Vaga N1-01 terminou de carregar. Você tem 10 minutos de tolerância para liberar a vaga antes da multa por ociosidade.',
      data: { sessionId, graceEndsAt, gracePeriodMinutes: 10 },
      readAt: null,
    });

    now = plusSimulatedMinutes(fullAt, 15);
    await as(driver).get('/sessions?pageSize=5').expect(200);
    await as(driver).get('/sessions/active').expect(200);
    const [idle] = await notificationsOf(driver);
    expect(idle).toMatchObject({
      type: 'IDLE_FEE_STARTED',
      title: 'Multa por ociosidade iniciada',
      data: {
        sessionId,
        idleStartsAt: graceEndsAt,
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
      },
    });

    await as(driver).post(`/sessions/${sessionId}/stop`).expect(200);
    expect(await typesOf(driver)).toEqual([
      'SESSION_ACTIVE',
      'CHARGING_COMPLETE',
      'IDLE_FEE_STARTED',
    ]);
    expect(pushedTitles(driverToken)).toEqual([
      'Carregador liberado',
      'Recarga concluída',
      'Multa por ociosidade iniciada',
    ]);
  });

  it('notifies declined and captured card payments', async () => {
    now = LATER;
    const started = await as(visitor)
      .post('/sessions', { chargePointId: visitorsPointId })
      .expect(201);
    const sessionId: string = started.body.id;
    const intentId: string = started.body.payment.paymentIntentId;

    payments.decline(intentId);
    await as(visitor)
      .post(`/sessions/${sessionId}/payment/confirm`)
      .expect(200);
    const [failed] = await notificationsOf(visitor);
    expect(failed).toMatchObject({
      type: 'PAYMENT_FAILED',
      title: 'Pagamento recusado',
      data: { sessionId, failureCode: 'card_declined' },
    });

    payments.confirm(intentId);
    now = new Date(LATER.getTime() + 1000);
    await as(visitor)
      .post(`/sessions/${sessionId}/payment/confirm`)
      .expect(200);
    now = plusSimulatedMinutes(now, 10);
    const stopped = await as(visitor)
      .post(`/sessions/${sessionId}/stop`)
      .expect(200);
    const capturedCents: number = stopped.body.payment.capturedCents;
    expect(capturedCents).toBeGreaterThan(0);

    expect(await typesOf(visitor)).toEqual([
      'PAYMENT_FAILED',
      'SESSION_ACTIVE',
      'PAYMENT_CAPTURED',
    ]);
    const [captured] = await notificationsOf(visitor);
    expect(captured).toMatchObject({
      title: 'Pagamento confirmado',
      data: { sessionId, amountCents: capturedCents, currency: 'BRL' },
    });
    expect(captured.body).toContain('no ponto Vaga N2-01');
    expect(pushedTitles(visitorToken)).toEqual([
      'Pagamento recusado',
      'Carregador liberado',
      'Pagamento confirmado',
    ]);
  });

  it('notifies sessions interrupted by the charger', async () => {
    now = new Date(LATER.getTime() + 3_600_000);
    vi.spyOn(app.get(ChargerGateway), 'start').mockRejectedValueOnce(
      new Error('charger offline'),
    );

    await as(driver)
      .post('/sessions', { chargePointId: privatePointId })
      .expect(503);

    const [interrupted] = await notificationsOf(driver);
    expect(interrupted).toMatchObject({
      type: 'SESSION_INTERRUPTED',
      title: 'Recarga interrompida',
      body: 'A recarga no ponto Vaga N1-01 foi interrompida antes de começar. Nenhum valor será cobrado.',
    });
  });

  it('notifies an invitee that already has an account', async () => {
    now = new Date(now.getTime() + 60_000);
    await as(manager)
      .post(`/organizations/${organizationId}/invites`, {
        email: visitor.email.toUpperCase(),
        unitLabel: 'E · 5',
      })
      .expect(201);

    const [invite] = await notificationsOf(visitor);
    expect(invite).toMatchObject({
      type: 'ORGANIZATION_INVITE',
      title: `Convite de Residencial ${run}`,
      body: `Marta convidou você para Residencial ${run} (unidade E · 5). Abra o link enviado para ${visitor.email} para aceitar.`,
      data: {
        organizationId,
        organizationName: `Residencial ${run}`,
        unitLabel: 'E · 5',
      },
    });
  });

  it('pages the notifications with the unread count', async () => {
    const page = await as(driver)
      .get('/me/notifications?page=2&pageSize=2')
      .expect(200);

    expect(page.body).toMatchObject({
      total: 4,
      page: 2,
      pageSize: 2,
      unreadCount: 4,
    });
    expect(page.body.items.map((item: NotificationBody) => item.type)).toEqual([
      'CHARGING_COMPLETE',
      'SESSION_ACTIVE',
    ]);
    await as(driver).get('/me/notifications?pageSize=101').expect(400);
  });

  it('marks notifications as read', async () => {
    now = new Date(now.getTime() + 60_000);
    const [latest] = await notificationsOf(driver);

    await as(visitor).post(`/me/notifications/${latest.id}/read`).expect(404);
    await as(driver).post('/me/notifications/not-a-uuid/read').expect(404);
    const read = await as(driver)
      .post(`/me/notifications/${latest.id}/read`)
      .expect(200);
    expect(read.body).toMatchObject({
      id: latest.id,
      readAt: now.toISOString(),
    });

    const later = new Date(now.getTime() + 60_000);
    now = later;
    const again = await as(driver)
      .post(`/me/notifications/${latest.id}/read`)
      .expect(200);
    expect(again.body.readAt).toBe(read.body.readAt);

    const all = await as(driver).post('/me/notifications/read-all').expect(200);
    expect(all.body).toEqual({ markedCount: 3, unreadCount: 0 });
    const list = await as(driver).get('/me/notifications').expect(200);
    expect(list.body.unreadCount).toBe(0);
    const visitorList = await as(visitor).get('/me/notifications').expect(200);
    expect(visitorList.body.unreadCount).toBe(4);
  });

  it('stores transitions detected late without pushing what the device already scheduled', async () => {
    now = new Date(now.getTime() + 3_600_000);
    outbox.clear();
    const started = await as(driver)
      .post('/sessions', { chargePointId: privatePointId })
      .expect(201);
    const sessionId: string = started.body.id;
    const projected = {
      chargingEndsAt: started.body.projectedChargingEndsAt as string,
      idleStartsAt: started.body.projectedIdleStartsAt as string,
    };
    expect(projected.chargingEndsAt).toEqual(expect.any(String));

    now = plusSimulatedMinutes(new Date(projected.idleStartsAt), 90);
    const idle = await as(driver).get('/sessions/active').expect(200);
    expect(idle.body.session).toMatchObject({
      status: 'IDLE',
      chargingEndedAt: projected.chargingEndsAt,
      idleStartsAt: projected.idleStartsAt,
      projectedIdleStartsAt: projected.idleStartsAt,
    });

    const notifications = await notificationsOf(driver);
    const complete = notifications.find(
      (notification) => notification.type === 'CHARGING_COMPLETE',
    );
    const idleFee = notifications.find(
      (notification) => notification.type === 'IDLE_FEE_STARTED',
    );
    expect(complete).toMatchObject({
      type: 'CHARGING_COMPLETE',
      data: { sessionId },
    });
    expect(idleFee).toMatchObject({
      type: 'IDLE_FEE_STARTED',
      data: { sessionId, idleStartsAt: projected.idleStartsAt },
    });
    expect(pushedTitles(driverToken)).toEqual(['Carregador liberado']);

    await as(driver).post(`/sessions/${sessionId}/stop`).expect(200);
  });
});
