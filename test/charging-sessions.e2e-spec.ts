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
import { FakePaymentGateway } from './../src/modules/payments/adapters/fake-payment.adapter.js';
import { PaymentGateway } from './../src/modules/payments/payment-gateway.port.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  process.env.CHARGER_DRIVER = 'mock';
  process.env.SIMULATION_SPEED = '60';
});

interface Session {
  id: string;
  accessToken: string;
}

const SPEED = 60;
const PEAK_EVENING = new Date('2026-10-07T19:00:00.000-03:00');
const TARIFF_START = new Date('2026-01-01T00:00:00.000-03:00');
const IDLE_TERMS = {
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
};

function plusSimulatedMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + (minutes * 60_000) / SPEED);
}

describe('Charging sessions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let now = PEAK_EVENING;
  const clock = { now: () => now };
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let driver: Session;
  let neighbour: Session;
  let visitor: Session;
  let privatePointId: string;
  let visitorsPointId: string;
  let offlinePointId: string;
  let sessionId: string;
  const payments = new FakePaymentGateway();

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'session-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      accessToken: response.body.accessToken,
    };
  }

  function get(path: string, session?: Session): request.Test {
    const pending = request(app.getHttpServer()).get(path);
    return session
      ? pending.set('Authorization', `Bearer ${session.accessToken}`)
      : pending;
  }

  function post(path: string, session: Session, body?: object): request.Test {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(body);
  }

  async function pointStatus(pointId: string): Promise<string> {
    const response = await get(`/charge-points/${pointId}`, driver).expect(200);
    return response.body.status;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(PaymentGateway)
      .useValue(payments)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    driver = await register('Dora');
    neighbour = await register('Nina');
    visitor = await register('Vitor');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        contractedDemandKw: 75,
        commonAreaReserveKw: 11.5,
        minChargingPowerKw: 3.7,
        memberships: {
          create: [
            { userId: driver.id, role: 'DRIVER', unitLabel: 'B · 42' },
            { userId: neighbour.id, role: 'DRIVER', unitLabel: 'A · 11' },
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

    const createPoint = (
      code: string,
      type: 'PRIVATE' | 'COMMERCIAL',
      maxPowerKw: number,
      isOnline = true,
    ) =>
      prisma.chargePoint.create({
        data: {
          organizationId,
          code,
          name: `Vaga ${code}`,
          type,
          latitude: -23.569,
          longitude: -46.631,
          maxPowerKw,
          isOnline,
          chargers: {
            create: {
              vendor: 'GoodWe HCA G2',
              serialNumber: `${code}-${run}`,
            },
          },
        },
      });
    privatePointId = (await createPoint('L1-01', 'PRIVATE', 7)).id;
    visitorsPointId = (await createPoint('L2-01', 'COMMERCIAL', 22)).id;
    offlinePointId = (await createPoint('L1-02', 'PRIVATE', 7, false)).id;
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
    await get('/sessions').expect(401);
    await get('/sessions/active').expect(401);
    await request(app.getHttpServer()).post('/sessions').send({}).expect(401);
  });

  it('validates the start payload', async () => {
    await post('/sessions', driver, {}).expect(400);
    await post('/sessions', driver, {
      chargePointId: privatePointId,
      limit: { type: 'ENERGY' },
    }).expect(400);
    await post('/sessions', driver, {
      chargePointId: privatePointId,
      limit: { type: 'SOC', value: 80 },
    }).expect(400);
    const amount = await post('/sessions', driver, {
      chargePointId: privatePointId,
      limit: { type: 'AMOUNT', value: 12.5 },
    }).expect(400);
    expect(amount.body.code).toBe('INVALID_LIMIT');
  });

  it('hides private points from non members', async () => {
    await post('/sessions', visitor, { chargePointId: privatePointId }).expect(
      404,
    );
  });

  it('reports no active session before charging', async () => {
    const response = await get('/sessions/active', driver).expect(200);
    expect(response.body).toEqual({ session: null });
  });

  it('starts a private session at the utility rate', async () => {
    const response = await post('/sessions', driver, {
      chargePointId: privatePointId,
    }).expect(201);
    sessionId = response.body.id;

    expect(response.body).toMatchObject({
      status: 'ACTIVE',
      chargePoint: { id: privatePointId, code: 'L1-01', name: 'Vaga L1-01' },
      organizationId,
      unitLabel: 'B · 42',
      regime: 'PRIVATE',
      limit: { type: 'FULL', energyKwh: null, amountCents: null },
      targetEnergyKwh: 29,
      startedAt: PEAK_EVENING.toISOString(),
      energyKwh: 0,
      allocatedPowerKw: 7,
      socPercent: 42,
      lockedRateCents: 89,
      demandFactor: 1.5,
      demandFactorSource: 'RULE',
      totalCents: 0,
      simulationSpeed: SPEED,
      payment: null,
      paymentSheet: null,
    });
    expect(await pointStatus(privatePointId)).toBe('CHARGING');
  });

  it('refuses a second session for the user or the point', async () => {
    const own = await post('/sessions', driver, {
      chargePointId: visitorsPointId,
    }).expect(409);
    expect(own.body.code).toBe('ACTIVE_SESSION_EXISTS');

    const busy = await post('/sessions', neighbour, {
      chargePointId: privatePointId,
    }).expect(409);
    expect(busy.body.code).toBe('CHARGE_POINT_BUSY');

    const offline = await post('/sessions', neighbour, {
      chargePointId: offlinePointId,
    }).expect(409);
    expect(offline.body.code).toBe('CHARGE_POINT_OFFLINE');
  });

  it('advances energy and readings on read', async () => {
    now = plusSimulatedMinutes(PEAK_EVENING, 60);
    const response = await get(`/sessions/${sessionId}`, driver).expect(200);

    expect(response.body).toMatchObject({
      status: 'ACTIVE',
      energyKwh: 7,
      powerKw: 7,
      socPercent: 56,
      energyCostCents: 623,
      totalCents: 623,
    });
    expect(response.body.readings).toHaveLength(12);
    expect(response.body.readings[0]).toEqual({
      at: plusSimulatedMinutes(PEAK_EVENING, 5).toISOString(),
      energyKwh: 0.583,
      powerKw: 7,
      socPercent: 43,
    });
  });

  it('moves to grace when full, then idle with the per minute fee up to the cap', async () => {
    const { completedAt } = mockTelemetry(
      {
        chargerSerialNumber: 'L1-01',
        transactionId: 'tx',
        startedAt: PEAK_EVENING,
        allocatedPowerKw: 7,
        targetEnergyWh: 29_000,
        batteryCapacityWh: MOCK_VEHICLE.batteryCapacityWh,
        initialSocPercent: MOCK_VEHICLE.socPercent,
        timeScale: SPEED,
      },
      { since: PEAK_EVENING, until: plusSimulatedMinutes(PEAK_EVENING, 600) },
    );
    const fullAt = completedAt!;

    now = plusSimulatedMinutes(fullAt, 5);
    const grace = await get(`/sessions/${sessionId}`, driver).expect(200);
    expect(grace.body).toMatchObject({
      status: 'GRACE',
      energyKwh: 29,
      powerKw: 0,
      socPercent: 100,
      chargingEndedAt: fullAt.toISOString(),
      graceEndsAt: plusSimulatedMinutes(fullAt, 10).toISOString(),
      energyCostCents: 2581,
      idleFeeCents: 0,
      totalCents: 2581,
    });
    expect(await pointStatus(privatePointId)).toBe('IDLE');

    now = plusSimulatedMinutes(fullAt, 16);
    const idle = await get('/sessions/active', driver).expect(200);
    expect(idle.body.session).toMatchObject({
      id: sessionId,
      status: 'IDLE',
      idleMinutes: 6,
      idleFeeCents: 150,
      totalCents: 2731,
    });

    now = plusSimulatedMinutes(fullAt, 10 + 300);
    const capped = await get(`/sessions/${sessionId}`, driver).expect(200);
    expect(capped.body).toMatchObject({
      status: 'IDLE',
      idleMinutes: 300,
      idleFeeCents: 3000,
      totalCents: 5581,
    });
  });

  it('closes the session when the driver unplugs', async () => {
    const response = await post(`/sessions/${sessionId}/stop`, driver).expect(
      200,
    );

    expect(response.body).toMatchObject({
      status: 'CLOSED',
      endedAt: now.toISOString(),
      idleFeeCents: 3000,
      totalCents: 5581,
    });
    const again = await post(`/sessions/${sessionId}/stop`, driver).expect(409);
    expect(again.body.code).toBe('SESSION_ALREADY_ENDED');
    expect(await pointStatus(privatePointId)).toBe('AVAILABLE');
    expect((await get('/sessions/active', driver)).body).toEqual({
      session: null,
    });
  });

  it('keeps sessions private to their driver', async () => {
    await get(`/sessions/${sessionId}`, neighbour).expect(404);
    await post(`/sessions/${sessionId}/stop`, neighbour).expect(404);
    await get(`/sessions/${randomUUID()}`, driver).expect(404);
    await get('/sessions/not-a-uuid', driver).expect(404);
  });

  it('charges visitors the commercial price with the demand factor and stops early', async () => {
    now = PEAK_EVENING;
    const started = await post('/sessions', visitor, {
      chargePointId: visitorsPointId,
      limit: { type: 'AMOUNT', value: 2000 },
    }).expect(201);
    expect(started.body).toMatchObject({
      status: 'AWAITING_PAYMENT',
      payment: { status: 'PENDING_AUTHORIZATION', authorizedCents: 5000 },
    });
    payments.confirm(started.body.payment.paymentIntentId);
    const confirmed = await post(
      `/sessions/${started.body.id}/payment/confirm`,
      visitor,
    ).expect(200);

    expect(confirmed.body).toMatchObject({
      status: 'ACTIVE',
      regime: 'COMMERCIAL',
      unitLabel: null,
      organizationId,
      lockedRateCents: 284,
      demandFactor: 1.5,
      limit: { type: 'AMOUNT', amountCents: 2000, energyKwh: null },
      targetEnergyKwh: 7.042,
      allocatedPowerKw: 22,
    });

    now = plusSimulatedMinutes(PEAK_EVENING, 10);
    const stopped = await post(
      `/sessions/${started.body.id}/stop`,
      visitor,
    ).expect(200);
    expect(stopped.body).toMatchObject({
      status: 'CLOSED',
      chargingEndedAt: now.toISOString(),
      energyKwh: 3.667,
      powerKw: 0,
      energyCostCents: 1041,
      idleFeeCents: 0,
      totalCents: 1041,
      payment: { status: 'CAPTURED', capturedCents: 1041 },
    });
    const detail = await get(`/sessions/${started.body.id}`, visitor).expect(
      200,
    );
    expect(detail.body.readings.at(-1)).toMatchObject({
      at: now.toISOString(),
      energyKwh: 3.667,
      powerKw: 0,
    });
  });

  it('lists the history of the driver', async () => {
    const response = await get('/sessions?page=1&pageSize=5', driver).expect(
      200,
    );

    expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 5 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      id: sessionId,
      status: 'CLOSED',
    });
    await get('/sessions?pageSize=0', driver).expect(400);
    await get('/sessions?pageSize=101', driver).expect(400);
  });

  it('filters the history by month in the Sao Paulo time zone', async () => {
    await prisma.chargingSession.create({
      data: {
        userId: driver.id,
        chargePointId: privatePointId,
        organizationId,
        unitLabel: 'B · 42',
        regime: 'PRIVATE',
        status: 'CLOSED',
        allocatedPowerKw: 7,
        lockedRateCents: 89,
        demandFactor: 1,
        demandFactorSource: 'RULE',
        ...IDLE_TERMS,
        startedAt: new Date('2026-11-01T02:30:00.000Z'),
        endedAt: new Date('2026-11-01T03:30:00.000Z'),
      },
    });

    const october = await get('/sessions?month=2026-10', driver).expect(200);
    expect(october.body.total).toBe(2);
    expect(october.body.items[0].startedAt).toBe('2026-11-01T02:30:00.000Z');

    const november = await get('/sessions?month=2026-11', driver).expect(200);
    expect(november.body).toMatchObject({ total: 0, items: [] });

    const september = await get('/sessions?month=2026-09', driver).expect(200);
    expect(september.body.total).toBe(0);

    const invalid = await get('/sessions?month=2026-13', driver).expect(400);
    expect(invalid.body.message).toContain('month must use the YYYY-MM format');
  });

  it('interrupts the session when the charger does not start', async () => {
    const gateway = app.get(ChargerGateway);
    const start = vi
      .spyOn(gateway, 'start')
      .mockRejectedValueOnce(new Error('charger offline'));

    const response = await post('/sessions', neighbour, {
      chargePointId: privatePointId,
    }).expect(503);

    expect(response.body.code).toBe('CHARGER_UNAVAILABLE');
    expect(start).toHaveBeenCalledOnce();
    const interrupted = await prisma.chargingSession.findFirstOrThrow({
      where: { chargePoint: { id: privatePointId }, status: 'INTERRUPTED' },
    });
    expect(interrupted.endedAt).not.toBeNull();
    expect(await pointStatus(privatePointId)).toBe('AVAILABLE');
  });

  it('refuses to start when the building has no capacity left', async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { contractedDemandKw: 15 },
    });

    const response = await post('/sessions', neighbour, {
      chargePointId: privatePointId,
    }).expect(409);

    expect(response.body.code).toBe('BUILDING_CAPACITY_EXCEEDED');
  });
});
