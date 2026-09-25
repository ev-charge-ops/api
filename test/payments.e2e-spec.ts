import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';
import {
  FAKE_PUBLISHABLE_KEY,
  FakePaymentGateway,
  type FakeWebhook,
} from './../src/modules/payments/adapters/fake-payment.adapter.js';
import {
  DisabledPaymentGateway,
  PaymentGateway,
} from './../src/modules/payments/payment-gateway.port.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  process.env.CHARGER_DRIVER = 'mock';
  process.env.SIMULATION_SPEED = '60';
  process.env.PAYMENT_HOLD_ENERGY_KWH = '60';
  process.env.PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES = '15';
});

interface Session {
  id: string;
  accessToken: string;
}

const SPEED = 60;
const PEAK_EVENING = new Date('2026-10-07T19:00:00.000-03:00');
const FULL_HOLD_CENTS = 60 * 284 + 3000;

function plusSimulatedMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + (minutes * 60_000) / SPEED);
}

function plusRealMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

async function createApp(
  gateway: PaymentGateway,
  clock: Clock,
): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(PaymentGateway)
    .useValue(gateway)
    .compile();
  const app = moduleFixture.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

describe('Card payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let now = PEAK_EVENING;
  const clock = { now: () => now };
  const payments = new FakePaymentGateway();
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let visitor: Session;
  let resident: Session;
  let commercialPointId: string;
  let privatePointId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'payment-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      accessToken: response.body.accessToken,
    };
  }

  function get(path: string, session: Session): request.Test {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${session.accessToken}`);
  }

  function post(path: string, session: Session, body?: object): request.Test {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(body);
  }

  function deliver(webhook: FakeWebhook, target = app): request.Test {
    return request(target.getHttpServer())
      .post('/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', webhook.signature)
      .send(webhook.payload.toString('utf8'));
  }

  async function startCommercial(body: object = {}): Promise<request.Response> {
    return post('/sessions', visitor, {
      chargePointId: commercialPointId,
      ...body,
    }).expect(201);
  }

  async function pointStatus(pointId: string): Promise<string> {
    const response = await get(`/charge-points/${pointId}`, visitor).expect(
      200,
    );
    return response.body.status;
  }

  beforeAll(async () => {
    app = await createApp(payments, clock);
    prisma = app.get(PrismaService);

    visitor = await register('Vera');
    resident = await register('Rui');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: { userId: resident.id, role: 'DRIVER', unitLabel: 'C · 7' },
        },
        tariffs: {
          create: {
            utilityRateCents: 89,
            baseRateCents: 189,
            accessFeeCents: 3500,
            idleFeeCentsPerMinute: 25,
            idleFeeCapCents: 3000,
            gracePeriodMinutes: 10,
            validFrom: new Date('2026-01-01T00:00:00.000-03:00'),
          },
        },
      },
    });
    organizationId = organization.id;
    const point = (code: string, type: 'PRIVATE' | 'COMMERCIAL') =>
      prisma.chargePoint.create({
        data: {
          organizationId,
          code,
          name: `Vaga ${code}`,
          type,
          latitude: -23.569,
          longitude: -46.631,
          maxPowerKw: 22,
          chargers: {
            create: {
              vendor: 'GoodWe HCA G2',
              serialNumber: `${code}-${run}`,
            },
          },
        },
      });
    commercialPointId = (await point('V-01', 'COMMERCIAL')).id;
    privatePointId = (await point('P-01', 'PRIVATE')).id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  afterEach(() => {
    now = PEAK_EVENING;
  });

  it('holds the estimated maximum on the card before charging', async () => {
    const started = await startCommercial();

    expect(started.body).toMatchObject({
      status: 'AWAITING_PAYMENT',
      regime: 'COMMERCIAL',
      lockedRateCents: 284,
      targetEnergyKwh: null,
      payment: {
        status: 'PENDING_AUTHORIZATION',
        currency: 'BRL',
        authorizedCents: FULL_HOLD_CENTS,
        capturedCents: null,
      },
      paymentSheet: {
        customerId: expect.stringMatching(/^cus_fake_/),
        customerEphemeralKeySecret: expect.stringMatching(/^ek_test_fake_/),
        publishableKey: FAKE_PUBLISHABLE_KEY,
        merchantDisplayName: 'EV ChargeOps',
      },
    });
    const intentId: string = started.body.payment.paymentIntentId;
    expect(started.body.paymentSheet.paymentIntentClientSecret).toBe(
      `${intentId}_secret_fake`,
    );
    expect(payments.intents.get(intentId)).toMatchObject({
      amountCents: FULL_HOLD_CENTS,
      currency: 'BRL',
      sessionId: started.body.id,
    });
    expect(
      payments.customers.get(started.body.paymentSheet.customerId),
    ).toEqual({
      userId: visitor.id,
      email: `vera-${run}@example.com`,
      name: 'Vera',
    });
    expect(await pointStatus(commercialPointId)).toBe('CHARGING');

    const waiting = await post(
      `/sessions/${started.body.id}/payment/confirm`,
      visitor,
    ).expect(200);
    expect(waiting.body.status).toBe('AWAITING_PAYMENT');

    const sheet = await post(
      `/sessions/${started.body.id}/payment/sheet`,
      visitor,
    ).expect(201);
    expect(sheet.body).toMatchObject({
      paymentIntentClientSecret: `${intentId}_secret_fake`,
      customerId: started.body.paymentSheet.customerId,
    });
    expect(sheet.body.customerEphemeralKeySecret).not.toBe(
      started.body.paymentSheet.customerEphemeralKeySecret,
    );

    now = plusRealMinutes(PEAK_EVENING, 1);
    payments.confirm(intentId);
    const authorized = payments.webhook(
      'payment_intent.amount_capturable_updated',
      intentId,
    );
    const delivered = await deliver(authorized).expect(200);
    expect(delivered.body).toEqual({ received: true, processed: true });

    const active = await get(`/sessions/${started.body.id}`, visitor).expect(
      200,
    );
    expect(active.body).toMatchObject({
      status: 'ACTIVE',
      startedAt: now.toISOString(),
      targetEnergyKwh: 29,
      payment: { status: 'AUTHORIZED', authorizedAt: now.toISOString() },
    });

    const duplicate = await deliver(authorized).expect(200);
    expect(duplicate.body).toEqual({ received: true, processed: false });
    const confirmedAgain = await post(
      `/sessions/${started.body.id}/payment/confirm`,
      visitor,
    ).expect(200);
    expect(confirmedAgain.body.status).toBe('ACTIVE');
    await post(`/sessions/${started.body.id}/payment/sheet`, visitor).expect(
      409,
    );

    now = plusSimulatedMinutes(now, 10);
    const stopped = await post(
      `/sessions/${started.body.id}/stop`,
      visitor,
    ).expect(200);
    expect(stopped.body).toMatchObject({
      status: 'CLOSED',
      energyKwh: 3.667,
      totalCents: 1041,
      payment: {
        status: 'CAPTURED',
        authorizedCents: FULL_HOLD_CENTS,
        capturedCents: 1041,
      },
    });
    expect(payments.intents.get(intentId)).toMatchObject({
      status: 'succeeded',
      amountReceivedCents: 1041,
    });

    const succeeded = await deliver(
      payments.webhook('payment_intent.succeeded', intentId),
    ).expect(200);
    expect(succeeded.body.processed).toBe(true);
    const stored = await prisma.payment.findUniqueOrThrow({
      where: { sessionId: started.body.id },
    });
    expect(stored).toMatchObject({
      status: 'CAPTURED',
      capturedCents: 1041,
      stripePaymentIntentId: intentId,
    });
    expect(await pointStatus(commercialPointId)).toBe('AVAILABLE');
  });

  it('reuses the Stripe customer of the driver', async () => {
    const first = await prisma.user.findUniqueOrThrow({
      where: { id: visitor.id },
    });
    const started = await startCommercial();

    expect(started.body.paymentSheet.customerId).toBe(first.stripeCustomerId);
    await post(`/sessions/${started.body.id}/stop`, visitor).expect(200);
  });

  it('releases the hold when the driver cancels before charging', async () => {
    const started = await startCommercial({
      limit: { type: 'ENERGY', value: 10 },
    });
    expect(started.body.payment.authorizedCents).toBe(5840);

    const stopped = await post(
      `/sessions/${started.body.id}/stop`,
      visitor,
    ).expect(200);

    expect(stopped.body).toMatchObject({
      status: 'INTERRUPTED',
      payment: { status: 'CANCELED', capturedCents: null },
    });
    expect(
      payments.intents.get(started.body.payment.paymentIntentId),
    ).toMatchObject({ status: 'canceled' });

    const canceled = await deliver(
      payments.webhook(
        'payment_intent.canceled',
        started.body.payment.paymentIntentId,
      ),
    ).expect(200);
    expect(canceled.body.processed).toBe(true);
    const session = await get(`/sessions/${started.body.id}`, visitor).expect(
      200,
    );
    expect(session.body.status).toBe('INTERRUPTED');
  });

  it('lets the driver retry after a declined card and starts on confirm', async () => {
    const started = await startCommercial();
    const intentId: string = started.body.payment.paymentIntentId;

    payments.decline(intentId, 'insufficient_funds');
    await deliver(
      payments.webhook('payment_intent.payment_failed', intentId),
    ).expect(200);
    const declined = await get(`/sessions/${started.body.id}`, visitor).expect(
      200,
    );
    expect(declined.body).toMatchObject({
      status: 'AWAITING_PAYMENT',
      payment: { status: 'FAILED', failureCode: 'insufficient_funds' },
    });

    payments.confirm(intentId);
    const confirmed = await post(
      `/sessions/${started.body.id}/payment/confirm`,
      visitor,
    ).expect(200);
    expect(confirmed.body).toMatchObject({
      status: 'ACTIVE',
      payment: { status: 'AUTHORIZED', failureCode: null },
    });

    now = new Date(now.getTime() + 300);
    const stopped = await post(
      `/sessions/${started.body.id}/stop`,
      visitor,
    ).expect(200);
    expect(stopped.body).toMatchObject({
      status: 'CLOSED',
      totalCents: 31,
      payment: { status: 'CANCELED', capturedCents: null },
    });
  });

  it('interrupts and releases holds that are not authorized in time', async () => {
    const started = await startCommercial();

    now = plusRealMinutes(PEAK_EVENING, 16);
    const active = await get('/sessions/active', visitor).expect(200);

    expect(active.body.session).toMatchObject({
      id: started.body.id,
      status: 'INTERRUPTED',
      payment: { status: 'CANCELED' },
    });
    expect((await get('/sessions/active', visitor)).body).toEqual({
      session: null,
    });
    expect(await pointStatus(commercialPointId)).toBe('AVAILABLE');
  });

  it('keeps private sessions on the monthly cost sharing', async () => {
    const started = await post('/sessions', resident, {
      chargePointId: privatePointId,
    }).expect(201);

    expect(started.body).toMatchObject({
      status: 'ACTIVE',
      payment: null,
      paymentSheet: null,
    });
    const confirm = await post(
      `/sessions/${started.body.id}/payment/confirm`,
      resident,
    ).expect(409);
    expect(confirm.body.code).toBe('PAYMENT_NOT_REQUIRED');
    await post(`/sessions/${started.body.id}/payment/sheet`, resident).expect(
      409,
    );
    await post(`/sessions/${started.body.id}/stop`, resident).expect(200);
  });

  it('keeps payments private to their driver', async () => {
    const started = await startCommercial();

    await post(`/sessions/${started.body.id}/payment/confirm`, resident).expect(
      404,
    );
    await post(`/sessions/${started.body.id}/payment/sheet`, resident).expect(
      404,
    );
    await post(`/sessions/${started.body.id}/stop`, visitor).expect(200);
  });

  it('rejects webhooks without a valid signature', async () => {
    const missing = await request(app.getHttpServer())
      .post('/payments/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send({ id: 'evt_1', type: 'payment_intent.succeeded' })
      .expect(400);
    expect(missing.body.code).toBe('INVALID_WEBHOOK_SIGNATURE');

    const forged = payments.webhook('payment_intent.succeeded', 'pi_unknown');
    await deliver({ ...forged, signature: 'forged' }).expect(400);
  });

  it('acknowledges events it does not handle or cannot match', async () => {
    const other = await deliver(
      payments.webhook('charge.refunded', 'pi_unknown'),
    ).expect(200);
    expect(other.body).toEqual({ received: true, processed: false });

    const unknown = await deliver(
      payments.webhook('payment_intent.succeeded', 'pi_unknown'),
    ).expect(200);
    expect(unknown.body).toEqual({ received: true, processed: true });
  });

  describe('without Stripe configured', () => {
    let disabledApp: INestApplication<App>;

    beforeAll(async () => {
      disabledApp = await createApp(new DisabledPaymentGateway(), clock);
    });

    afterAll(async () => {
      await disabledApp.close();
    });

    it('refuses commercial sessions with a clear error code', async () => {
      const response = await request(disabledApp.getHttpServer())
        .post('/sessions')
        .set('Authorization', `Bearer ${visitor.accessToken}`)
        .send({ chargePointId: commercialPointId })
        .expect(503);

      expect(response.body.code).toBe('PAYMENTS_UNAVAILABLE');
      expect(await pointStatus(commercialPointId)).toBe('AVAILABLE');
    });

    it('answers the webhook with 503', async () => {
      const response = await deliver(
        payments.webhook('payment_intent.succeeded', 'pi_unknown'),
        disabledApp,
      ).expect(503);

      expect(response.body.code).toBe('PAYMENTS_UNAVAILABLE');
    });
  });
});
