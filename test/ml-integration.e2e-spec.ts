import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { FakePaymentGateway } from './../src/modules/payments/adapters/fake-payment.adapter.js';
import { PaymentGateway } from './../src/modules/payments/payment-gateway.port.js';

const ML_PORT = vi.hoisted(() => {
  const port = 47_000 + Math.floor(Math.random() * 1000);
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  process.env.CHARGER_DRIVER = 'mock';
  process.env.SIMULATION_SPEED = '60';
  process.env.ML_URL = `http://127.0.0.1:${port}/`;
  return port;
});

interface Session {
  id: string;
  accessToken: string;
}

interface MlCall {
  path: string;
  body: Record<string, unknown>;
}

type MlMode = 'healthy' | 'failing';

const PEAK_EVENING = new Date('2026-10-07T19:00:00.000-03:00');

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () =>
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')),
    );
  });
}

describe('ML integration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mlServer: Server;
  let mode: MlMode = 'healthy';
  const calls: MlCall[] = [];
  let now = PEAK_EVENING;
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let visitor: Session;
  let pointId: string;
  const payments = new FakePaymentGateway();

  async function startPaid(): Promise<request.Response> {
    const started = await post('/sessions', visitor, {
      chargePointId: pointId,
    }).expect(201);
    payments.confirm(started.body.payment.paymentIntentId);
    await post(`/sessions/${started.body.id}/payment/confirm`, visitor).expect(
      200,
    );
    return started;
  }

  function post(path: string, session: Session, body?: object): request.Test {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(body);
  }

  beforeAll(async () => {
    mlServer = createServer((req, res) => {
      void readBody(req).then((body) => {
        calls.push({ path: req.url ?? '', body });
        if (mode === 'failing') {
          res.writeHead(503).end();
          return;
        }
        const payload =
          req.url === '/demand-factor'
            ? { factor: 1.2, modelVersion: 'demand-test-1' }
            : {
                score: 0.8731,
                isAnomaly: true,
                modelVersion: 'anomaly-test-1',
              };
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(payload));
      });
    });
    await new Promise<void>((resolve) =>
      mlServer.listen(ML_PORT, '127.0.0.1', resolve),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue({ now: () => now })
      .overrideProvider(PaymentGateway)
      .useValue(payments)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const email = `vito-${run}@example.com`;
    emails.push(email);
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Vito', email, password: 'ml-password-123' })
      .expect(201);
    visitor = {
      id: registered.body.user.id,
      accessToken: registered.body.accessToken,
    };

    const organization = await prisma.organization.create({
      data: { name: `Shopping ${run}`, type: 'COMMERCIAL' },
    });
    organizationId = organization.id;
    const point = await prisma.chargePoint.create({
      data: {
        organizationId,
        code: 'P3-01',
        name: 'Shopping P3',
        type: 'COMMERCIAL',
        latitude: -23.5789,
        longitude: -46.6262,
        maxPowerKw: 22,
        chargers: {
          create: { vendor: 'GoodWe HCA G2', serialNumber: `P3-${run}` },
        },
        tariffs: {
          create: {
            organizationId,
            utilityRateCents: 89,
            baseRateCents: 189,
            accessFeeCents: 0,
            idleFeeCentsPerMinute: 25,
            idleFeeCapCents: 3000,
            gracePeriodMinutes: 10,
            validFrom: new Date('2026-01-01T00:00:00-03:00'),
          },
        },
      },
    });
    pointId = point.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
    await new Promise((resolve) => mlServer.close(resolve));
  });

  it('prices with the model factor and scores the session when it closes', async () => {
    const started = await startPaid();

    expect(started.body).toMatchObject({
      lockedRateCents: 227,
      demandFactor: 1.2,
      demandFactorSource: 'MODEL',
      demandModelVersion: 'demand-test-1',
    });
    expect(calls.find((call) => call.path === '/demand-factor')?.body).toEqual({
      hour: 19,
      dayOfWeek: 3,
      occupancyRatio: 0,
      queueLength: 0,
      chargePointType: 'COMMERCIAL',
    });

    now = new Date(PEAK_EVENING.getTime() + 30_000);
    const stopped = await post(
      `/sessions/${started.body.id}/stop`,
      visitor,
    ).expect(200);

    expect(stopped.body).toMatchObject({
      status: 'CLOSED',
      anomalyScore: 0.8731,
      isAnomaly: true,
    });
    expect(
      calls.find((call) => call.path === '/anomaly-score')?.body,
    ).toMatchObject({
      chargePointType: 'COMMERCIAL',
      hour: 19,
      chargingMinutes: 30,
      energyKwh: 11,
      allocatedPowerKw: 22,
    });
    const stored = await prisma.chargingSession.findUniqueOrThrow({
      where: { id: started.body.id },
    });
    expect(stored.anomalyModelVersion).toBe('anomaly-test-1');
    expect(stored.isAnomaly).toBe(true);
  });

  it('falls back to the rules and skips the score when the service fails', async () => {
    mode = 'failing';
    now = new Date('2026-10-08T02:00:00.000-03:00');

    const points = await request(app.getHttpServer())
      .get(`/charge-points/${pointId}`)
      .set('Authorization', `Bearer ${visitor.accessToken}`)
      .expect(200);
    expect(points.body.pricing).toMatchObject({
      demandFactorSource: 'RULE',
      demandFactor: 0.8,
      pricePerKwhCents: 151,
      demandModelVersion: null,
    });

    const started = await startPaid();
    expect(started.body).toMatchObject({
      lockedRateCents: 151,
      demandFactorSource: 'RULE',
      demandModelVersion: null,
    });

    now = new Date(now.getTime() + 10_000);
    const stopped = await post(
      `/sessions/${started.body.id}/stop`,
      visitor,
    ).expect(200);
    expect(stopped.body).toMatchObject({
      status: 'CLOSED',
      anomalyScore: null,
      isAnomaly: null,
    });
  });
});
