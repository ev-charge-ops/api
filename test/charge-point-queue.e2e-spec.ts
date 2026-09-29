import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { DemandFactorProvider } from './../src/modules/intelligence/demand-factor/demand-factor.provider.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  process.env.CHARGER_DRIVER = 'mock';
  process.env.SIMULATION_SPEED = '60';
  process.env.ML_URL = '';
});

interface Session {
  id: string;
  accessToken: string;
}

const NIGHT = new Date('2026-10-07T03:00:00.000-03:00');
const TARIFF_START = new Date('2026-01-01T00:00:00.000-03:00');

function minutesAfter(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

describe('Charge point queue (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let now = NIGHT;
  const clock = { now: () => now };
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let ana: Session;
  let bia: Session;
  let caio: Session;
  let dora: Session;
  let outsider: Session;
  let pointId: string;
  let secondPointId: string;
  let freePointId: string;
  let offlinePointId: string;
  let anaSessionId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'queue-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
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

  const queuePath = (id: string) => `/charge-points/${id}/queue`;

  async function notificationsOf(session: Session) {
    const response = await as(session).get('/me/notifications').expect(200);
    return response.body.items as {
      type: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    }[];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    ana = await register('Ana');
    bia = await register('Bia');
    caio = await register('Caio');
    dora = await register('Dora');
    outsider = await register('Otavio');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: [ana, bia, caio, dora].map((member, index) => ({
            userId: member.id,
            role: 'DRIVER' as const,
            unitLabel: `F · ${index + 1}`,
          })),
        },
        tariffs: {
          create: {
            utilityRateCents: 89,
            accessFeeCents: 3500,
            idleFeeCentsPerMinute: 25,
            idleFeeCapCents: 3000,
            gracePeriodMinutes: 10,
            validFrom: TARIFF_START,
          },
        },
      },
    });
    organizationId = organization.id;
    const createPoint = async (code: string, isOnline = true) =>
      (
        await prisma.chargePoint.create({
          data: {
            organizationId,
            code,
            name: `Vaga ${code}`,
            type: 'PRIVATE',
            latitude: -23.569,
            longitude: -46.631,
            maxPowerKw: 7,
            isOnline,
            chargers: {
              create: {
                vendor: 'GoodWe HCA G2',
                serialNumber: `${code}-${run}`,
              },
            },
          },
        })
      ).id;
    pointId = await createPoint('Q1-01');
    secondPointId = await createPoint('Q1-02');
    freePointId = await createPoint('Q1-03');
    offlinePointId = await createPoint('Q1-04', false);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('requires authentication', async () => {
    const server = app.getHttpServer();
    await request(server).post(queuePath(pointId)).expect(401);
    await request(server).delete(queuePath(pointId)).expect(401);
    await request(server)
      .get(`${queuePath(pointId)}/me`)
      .expect(401);
  });

  it('only lets drivers queue for busy points they can use', async () => {
    const started = await as(ana)
      .post('/sessions', { chargePointId: pointId })
      .expect(201);
    anaSessionId = started.body.id;

    await as(outsider).post(queuePath(pointId)).expect(404);
    await as(bia).post(queuePath(randomUUID())).expect(404);
    const available = await as(bia).post(queuePath(freePointId)).expect(409);
    expect(available.body.code).toBe('CHARGE_POINT_AVAILABLE');
    const offline = await as(bia).post(queuePath(offlinePointId)).expect(409);
    expect(offline.body.code).toBe('CHARGE_POINT_OFFLINE');
    const own = await as(ana).post(queuePath(pointId)).expect(409);
    expect(own.body.code).toBe('QUEUE_OWN_SESSION');
  });

  it('lines drivers up once each', async () => {
    const first = await as(bia).post(queuePath(pointId)).expect(201);
    expect(first.body).toMatchObject({
      chargePointId: pointId,
      status: 'WAITING',
      position: 1,
      queueLength: 1,
      reservedUntil: null,
      createdAt: now.toISOString(),
    });

    now = minutesAfter(NIGHT, 1);
    const second = await as(caio).post(queuePath(pointId)).expect(201);
    expect(second.body).toMatchObject({ position: 2, queueLength: 2 });

    const again = await as(bia).post(queuePath(pointId)).expect(409);
    expect(again.body.code).toBe('ALREADY_IN_QUEUE');

    await as(dora)
      .post('/sessions', { chargePointId: secondPointId })
      .expect(201);
    const elsewhere = await as(bia).post(queuePath(secondPointId)).expect(409);
    expect(elsewhere.body.code).toBe('ACTIVE_QUEUE_EXISTS');
  });

  it('shows the queue on the charge point and feeds it to the demand factor', async () => {
    const getFactor = vi.spyOn(app.get(DemandFactorProvider), 'getFactor');

    const response = await as(caio)
      .get(`/charge-points/${pointId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'CHARGING',
      queueLength: 2,
      reservedUntil: null,
      myQueueEntry: { status: 'WAITING', position: 2, queueLength: 2 },
      pricing: { demandLevel: 'PEAK' },
    });
    expect(getFactor).toHaveBeenCalledWith(
      expect.objectContaining({ chargePointType: 'PRIVATE', queueLength: 2 }),
    );
    const list = await as(ana).get('/charge-points').expect(200);
    expect(
      list.body.find((point: { id: string }) => point.id === pointId),
    ).toMatchObject({ queueLength: 2, myQueueEntry: null });

    const mine = await as(bia)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(mine.body).toMatchObject({ status: 'WAITING', position: 1 });
    const none = await as(ana)
      .get(`${queuePath(pointId)}/me`)
      .expect(404);
    expect(none.body.code).toBe('QUEUE_ENTRY_NOT_FOUND');
    getFactor.mockRestore();
  });

  it('reserves the point for the head of the queue when the session ends', async () => {
    now = minutesAfter(NIGHT, 30);
    await as(ana).post(`/sessions/${anaSessionId}/stop`).expect(200);
    const reservedUntil = minutesAfter(now, 10).toISOString();

    const [turn] = await notificationsOf(bia);
    expect(turn).toMatchObject({
      type: 'QUEUE_TURN',
      title: 'Sua vez no ponto Vaga Q1-01',
      body: 'O ponto Vaga Q1-01 está livre e reservado para você por 10 minutos, até 03:40. Inicie a recarga antes disso para não perder a vez.',
      data: {
        chargePointId: pointId,
        chargePointName: 'Vaga Q1-01',
        reservedUntil,
        queueEntryId: expect.any(String),
      },
    });

    const point = await as(caio).get(`/charge-points/${pointId}`).expect(200);
    expect(point.body).toMatchObject({
      status: 'AVAILABLE',
      queueLength: 2,
      reservedUntil,
      myQueueEntry: { status: 'WAITING', position: 2 },
    });
    const mine = await as(bia)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(mine.body).toMatchObject({
      status: 'NOTIFIED',
      position: 1,
      reservedUntil,
    });

    for (const driver of [caio, ana]) {
      const blocked = await as(driver)
        .post('/sessions', { chargePointId: pointId })
        .expect(409);
      expect(blocked.body.code).toBe('CHARGE_POINT_RESERVED');
    }
  });

  it('passes an expired reservation to the next driver on read', async () => {
    now = minutesAfter(NIGHT, 41);

    const point = await as(ana).get(`/charge-points/${pointId}`).expect(200);
    expect(point.body).toMatchObject({
      queueLength: 1,
      reservedUntil: minutesAfter(now, 10).toISOString(),
    });

    const expired = await as(bia)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(expired.body).toMatchObject({
      status: 'EXPIRED',
      position: null,
      queueLength: 1,
      endedAt: now.toISOString(),
    });
    const next = await as(caio)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(next.body).toMatchObject({ status: 'NOTIFIED', position: 1 });
    const [turn] = await notificationsOf(caio);
    expect(turn.type).toBe('QUEUE_TURN');

    const tooLate = await as(bia)
      .post('/sessions', { chargePointId: pointId })
      .expect(409);
    expect(tooLate.body.code).toBe('CHARGE_POINT_RESERVED');
  });

  it('fulfills the reservation when the driver starts charging', async () => {
    await as(caio).post('/sessions', { chargePointId: pointId }).expect(201);

    const fulfilled = await as(caio)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(fulfilled.body).toMatchObject({
      status: 'FULFILLED',
      position: null,
      queueLength: 0,
    });
    const point = await as(caio).get(`/charge-points/${pointId}`).expect(200);
    expect(point.body).toMatchObject({
      status: 'CHARGING',
      queueLength: 0,
      reservedUntil: null,
      myQueueEntry: null,
    });
  });

  it('lets drivers leave the queue', async () => {
    await as(bia).post(queuePath(pointId)).expect(201);

    await as(caio).delete(queuePath(pointId)).expect(404);
    await as(bia).delete(queuePath(secondPointId)).expect(404);
    await as(bia).delete(queuePath(pointId)).expect(204);
    const left = await as(bia)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(left.body).toMatchObject({ status: 'LEFT', position: null });
    await as(bia).delete(queuePath(pointId)).expect(404);
  });

  it('drops the queue entry when the driver charges somewhere else', async () => {
    await as(bia).post(queuePath(pointId)).expect(201);

    await as(bia).post('/sessions', { chargePointId: freePointId }).expect(201);

    const left = await as(bia)
      .get(`${queuePath(pointId)}/me`)
      .expect(200);
    expect(left.body).toMatchObject({ status: 'LEFT', queueLength: 0 });
  });
});
