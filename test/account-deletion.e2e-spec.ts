import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';
import { FakePaymentGateway } from './../src/modules/payments/adapters/fake-payment.adapter.js';
import { PaymentGateways } from './../src/modules/payments/payment-gateways.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
});

interface Session {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

const PASSWORD = 'deletion-password-123';

describe('Account deletion (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let outbox: MailOutbox;
  const now = new Date('2026-10-08T10:00:00.000-03:00');
  const clock = { now: () => now };
  const payments = new FakePaymentGateway();
  const livePayments = new FakePaymentGateway('live');
  const run = randomUUID();
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: PASSWORD })
      .expect(201);
    userIds.push(response.body.user.id);
    return {
      id: response.body.user.id,
      email,
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  function deleteAccount(session: Session, body?: object): request.Test {
    return request(app.getHttpServer())
      .delete('/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(body);
  }

  async function organization(
    type: 'PRIVATE' | 'COMMERCIAL',
    members: { userId: string; role: 'MANAGER' | 'DRIVER' }[],
  ) {
    const created = await prisma.organization.create({
      data: {
        name: `Residencial ${randomUUID()}`,
        type,
        memberships: {
          create: members.map((member) => ({ ...member, unitLabel: 'D · 4' })),
        },
        chargePoints: {
          create: {
            code: 'P-01',
            name: 'Vaga P-01',
            type: 'PRIVATE',
            latitude: -23.56,
            longitude: -46.63,
            maxPowerKw: 7,
          },
        },
      },
      include: { chargePoints: true },
    });
    organizationIds.push(created.id);
    return created;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(PaymentGateways)
      .useValue(new PaymentGateways({ TEST: payments, LIVE: livePayments }))
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(MailOutbox);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('requires authentication and the typed confirmation', async () => {
    await request(app.getHttpServer())
      .delete('/me')
      .send({ confirm: 'EXCLUIR' })
      .expect(401);
    const user = await register('Clara');

    await deleteAccount(user, { password: PASSWORD }).expect(400);
    await deleteAccount(user, {
      password: PASSWORD,
      confirm: 'excluir',
    }).expect(400);
    const missing = await deleteAccount(user, { confirm: 'EXCLUIR' }).expect(
      400,
    );
    expect(missing.body.code).toBe('INVALID_PASSWORD');
    const wrong = await deleteAccount(user, {
      password: 'not-the-password',
      confirm: 'EXCLUIR',
    }).expect(400);
    expect(wrong.body.code).toBe('INVALID_PASSWORD');
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).toMatchObject({ email: user.email, name: 'Clara' });
  });

  it('anonymizes the user and removes the access data, keeping the condo history', async () => {
    const user = await register('Paula');
    const condo = await organization('PRIVATE', [
      { userId: user.id, role: 'DRIVER' },
    ]);
    const session = await prisma.chargingSession.create({
      data: {
        userId: user.id,
        chargePointId: condo.chargePoints[0].id,
        organizationId: condo.id,
        unitLabel: 'D · 4',
        regime: 'PRIVATE',
        status: 'CLOSED',
        allocatedPowerKw: 7,
        lockedRateCents: 89,
        demandFactor: 1,
        demandFactorSource: 'RULE',
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
        gracePeriodMinutes: 10,
        startedAt: new Date('2026-10-01T20:00:00.000-03:00'),
        endedAt: new Date('2026-10-01T22:00:00.000-03:00'),
        energyKwh: 12.5,
        energyCostCents: 1113,
        totalCents: 1113,
      },
    });
    const testCustomer = await payments.createCustomer({
      userId: user.id,
      email: user.email,
      name: 'Paula',
    });
    const liveCustomer = await livePayments.createCustomer({
      userId: user.id,
      email: user.email,
      name: 'Paula',
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeCustomerId: testCustomer,
        stripeLiveCustomerId: liveCustomer,
        identities: {
          create: { provider: 'GOOGLE', subject: `google-${run}` },
        },
        pushTokens: {
          create: {
            token: `ExponentPushToken[${run}]`,
            platform: 'IOS',
          },
        },
      },
    });
    const pending = await request(app.getHttpServer())
      .post('/me/deletion-request')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ reason: 'Vou vender o carro' })
      .expect(202);

    const deleted = await deleteAccount(user, {
      password: PASSWORD,
      confirm: 'EXCLUIR',
    }).expect(200);

    expect(deleted.body).toEqual({
      id: pending.body.id,
      status: 'COMPLETED',
      reason: 'Vou vender o carro',
      requestedAt: now.toISOString(),
      processedAt: now.toISOString(),
    });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).toMatchObject({
      name: 'Usuário excluído',
      email: `deleted+${user.id}@evchargeops.invalid`,
      passwordHash: null,
      stripeCustomerId: null,
      stripeLiveCustomerId: null,
    });
    const where = { where: { userId: user.id } };
    expect(await prisma.userIdentity.count(where)).toBe(0);
    expect(await prisma.refreshToken.count(where)).toBe(0);
    expect(await prisma.pushToken.count(where)).toBe(0);
    expect(await prisma.membership.count(where)).toBe(1);
    expect(
      await prisma.chargingSession.findUniqueOrThrow({
        where: { id: session.id },
      }),
    ).toMatchObject({ userId: user.id, unitLabel: 'D · 4', totalCents: 1113 });
    expect(await prisma.deletionRequest.findMany(where)).toEqual([
      expect.objectContaining({
        id: pending.body.id,
        status: 'COMPLETED',
        processedAt: now,
      }),
    ]);

    expect(outbox.lastTo(user.email)?.subject).toBe('Sua conta foi excluída');
    expect(payments.customers.has(testCustomer)).toBe(false);
    expect(livePayments.customers.has(liveCustomer)).toBe(false);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('lets accounts without a password delete with the confirmation only', async () => {
    const user = await register('Otavio');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: null },
    });

    const deleted = await deleteAccount(user, { confirm: 'EXCLUIR' }).expect(
      200,
    );

    expect(deleted.body).toMatchObject({
      status: 'COMPLETED',
      reason: null,
      requestedAt: now.toISOString(),
      processedAt: now.toISOString(),
    });
    expect(
      await prisma.deletionRequest.count({
        where: { userId: user.id, status: 'COMPLETED' },
      }),
    ).toBe(1);
  });

  it('refuses to delete the only manager of an organization', async () => {
    const manager = await register('Mara');
    const other = await register('Mauro');
    const condo = await organization('PRIVATE', [
      { userId: manager.id, role: 'MANAGER' },
    ]);

    const refused = await deleteAccount(manager, {
      password: PASSWORD,
      confirm: 'EXCLUIR',
    }).expect(409);
    expect(refused.body.code).toBe('LAST_MANAGER');
    expect(refused.body.message).toContain(condo.name);

    await prisma.membership.create({
      data: { userId: other.id, organizationId: condo.id, role: 'MANAGER' },
    });
    await deleteAccount(manager, {
      password: PASSWORD,
      confirm: 'EXCLUIR',
    }).expect(200);
  });
});
