import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
});

interface Session {
  id: string;
  accessToken: string;
}

interface SessionFixture {
  user: Session;
  pointId: string;
  unitLabel: string | null;
  regime: 'PRIVATE' | 'COMMERCIAL';
  status: 'CLOSED' | 'INTERRUPTED';
  startedAt: string;
  chargingEndedAt: string;
  energyKwh: string;
  energyCostCents: number;
  idleFeeCents?: number;
  allocatedPowerKw?: number;
  anomalyScore?: string;
  isAnomaly?: boolean;
}

const NOW = new Date('2026-10-07T12:00:00.000-03:00');
const local = (value: string) => new Date(`${value}:00.000-03:00`);

describe('Cost sharing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let privatePointId: string;
  let visitorsPointId: string;
  let manager: Session;
  let tenantA: Session;
  let tenantB: Session;
  let tenantC: Session;
  let visitor: Session;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'sharing-password-123' })
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

  async function createSession(fixture: SessionFixture): Promise<void> {
    const idleFeeCents = fixture.idleFeeCents ?? 0;
    const startedAt = local(fixture.startedAt);
    const chargingEndedAt = local(fixture.chargingEndedAt);
    await prisma.chargingSession.create({
      data: {
        userId: fixture.user.id,
        chargePointId: fixture.pointId,
        organizationId,
        unitLabel: fixture.unitLabel,
        regime: fixture.regime,
        status: fixture.status,
        allocatedPowerKw: fixture.allocatedPowerKw ?? 7,
        lockedRateCents: fixture.regime === 'PRIVATE' ? 89 : 284,
        demandFactor: fixture.regime === 'PRIVATE' ? 1 : 1.5,
        demandFactorSource: 'RULE',
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
        gracePeriodMinutes: 10,
        startedAt,
        chargingEndedAt,
        endedAt: chargingEndedAt,
        energyKwh: fixture.energyKwh,
        energyCostCents: fixture.energyCostCents,
        idleFeeCents,
        idleMinutes: idleFeeCents / 25,
        totalCents: fixture.energyCostCents + idleFeeCents,
        anomalyScore: fixture.anomalyScore ?? null,
        isAnomaly: fixture.isAnomaly ?? null,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue({ now: () => NOW })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    manager = await register('Mauro');
    tenantA = await register('Alice');
    tenantB = await register('Bruno');
    tenantC = await register('Carla');
    visitor = await register('Vera');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        contractedDemandKw: 75,
        commonAreaReserveKw: 11.5,
        minChargingPowerKw: 3.7,
        memberships: {
          create: [
            { userId: manager.id, role: 'MANAGER' },
            { userId: tenantA.id, role: 'DRIVER', unitLabel: 'A · 11' },
            { userId: tenantB.id, role: 'DRIVER', unitLabel: 'B · 42' },
            { userId: tenantC.id, role: 'DRIVER', unitLabel: 'B · 11' },
          ],
        },
        tariffs: {
          create: {
            utilityRateCents: 89,
            accessFeeCents: 3500,
            idleFeeCentsPerMinute: 25,
            idleFeeCapCents: 3000,
            gracePeriodMinutes: 10,
            validFrom: local('2026-01-01T00:00'),
          },
        },
      },
    });
    organizationId = organization.id;
    const point = (code: string, type: 'PRIVATE' | 'COMMERCIAL', kw: number) =>
      prisma.chargePoint.create({
        data: {
          organizationId,
          code,
          name: `Vaga ${code}`,
          type,
          latitude: -23.569,
          longitude: -46.631,
          maxPowerKw: kw,
        },
      });
    const privatePoint = await point('L1-01', 'PRIVATE', 7);
    const visitorsPoint = await point('L2-01', 'COMMERCIAL', 22);
    privatePointId = privatePoint.id;
    visitorsPointId = visitorsPoint.id;

    const base = { pointId: privatePoint.id, regime: 'PRIVATE' as const };
    await createSession({
      ...base,
      user: tenantA,
      unitLabel: 'A · 11',
      status: 'CLOSED',
      startedAt: '2026-08-03T19:00',
      chargingEndedAt: '2026-08-03T20:41',
      energyKwh: '11.760',
      energyCostCents: 1047,
    });
    await createSession({
      ...base,
      user: tenantA,
      unitLabel: 'A · 11',
      status: 'CLOSED',
      startedAt: '2026-08-10T20:00',
      chargingEndedAt: '2026-08-10T20:35',
      energyKwh: '4.050',
      energyCostCents: 360,
      idleFeeCents: 150,
    });
    await createSession({
      ...base,
      user: tenantB,
      unitLabel: 'B · 42',
      status: 'CLOSED',
      startedAt: '2026-08-10T20:30',
      chargingEndedAt: '2026-08-10T21:54',
      energyKwh: '9.800',
      energyCostCents: 872,
      idleFeeCents: 3000,
      anomalyScore: '0.9132',
      isAnomaly: true,
    });
    await createSession({
      ...base,
      user: tenantB,
      unitLabel: 'B · 42',
      status: 'INTERRUPTED',
      startedAt: '2026-08-12T07:00',
      chargingEndedAt: '2026-08-12T07:01',
      energyKwh: '0',
      energyCostCents: 0,
    });
    await createSession({
      pointId: visitorsPoint.id,
      regime: 'COMMERCIAL',
      user: visitor,
      unitLabel: null,
      status: 'CLOSED',
      startedAt: '2026-08-10T21:00',
      chargingEndedAt: '2026-08-10T21:20',
      energyKwh: '7.042',
      energyCostCents: 2000,
      allocatedPowerKw: 22,
      anomalyScore: '0.6207',
      isAnomaly: true,
    });
    await createSession({
      ...base,
      user: tenantA,
      unitLabel: 'A · 11',
      status: 'CLOSED',
      startedAt: '2026-09-01T01:00',
      chargingEndedAt: '2026-09-01T02:00',
      energyKwh: '7.000',
      energyCostCents: 623,
      anomalyScore: '0.1204',
      isAnomaly: false,
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const path = (suffix: string) => `/organizations/${organizationId}/${suffix}`;

  it('is restricted to managers', async () => {
    await get(path('statements?month=2026-08')).expect(401);
    await get(path('statements?month=2026-08'), tenantA).expect(403);
    await get(path('statements/export.csv?month=2026-08'), tenantA).expect(403);
    await get(path('sessions'), tenantA).expect(403);
    await get(path('overview'), tenantA).expect(403);
    await get(path('overview'), visitor).expect(404);
  });

  it('validates the month', async () => {
    await get(path('statements?month=2026-13'), manager).expect(400);
    await get(path('statements?month=08-2026'), manager).expect(400);
    await get(path('sessions?status=PARKED'), manager).expect(400);
    await get(path('sessions?anomaly=yes'), manager).expect(400);
    await get(path('sessions?chargePointId=L1-01'), manager).expect(400);
  });

  it('builds the monthly statement per unit', async () => {
    const response = await get(
      path('statements?month=2026-08'),
      manager,
    ).expect(200);

    expect(response.body).toEqual({
      month: '2026-08',
      periodStart: '2026-08-01T03:00:00.000Z',
      periodEnd: '2026-09-01T03:00:00.000Z',
      accessFeeCents: 3500,
      lines: [
        {
          unitLabel: 'A · 11',
          sessionsCount: 2,
          energyKwh: 15.81,
          energyCents: 1407,
          accessFeeCents: 3500,
          idleFeeCents: 150,
          totalCents: 5057,
        },
        {
          unitLabel: 'B · 11',
          sessionsCount: 0,
          energyKwh: 0,
          energyCents: 0,
          accessFeeCents: 3500,
          idleFeeCents: 0,
          totalCents: 3500,
        },
        {
          unitLabel: 'B · 42',
          sessionsCount: 1,
          energyKwh: 9.8,
          energyCents: 872,
          accessFeeCents: 3500,
          idleFeeCents: 3000,
          totalCents: 7372,
        },
      ],
      totals: {
        unitsCount: 3,
        sessionsCount: 3,
        energyKwh: 25.61,
        energyCents: 2279,
        accessFeeCents: 10_500,
        idleFeeCents: 3150,
        totalCents: 15_929,
      },
    });
  });

  it('exports the statement for the bill importer', async () => {
    const response = await get(
      path('statements/export.csv?month=2026-08'),
      manager,
    )
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="rateio-2026-08.csv"',
    );
    const body = response.body as Buffer;
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(body.subarray(3).toString('utf8')).toBe(
      [
        'unidade;kwh;energia;acesso;ocupacao;total',
        'A · 11;15,81;14,07;35,00;1,50;50,57',
        'B · 11;0,00;0,00;35,00;0,00;35,00',
        'B · 42;9,80;8,72;35,00;30,00;73,72',
        '',
      ].join('\r\n'),
    );
  });

  it('lists the sessions of the organization with filters', async () => {
    const august = await get(path('sessions?month=2026-08'), manager).expect(
      200,
    );
    expect(august.body.total).toBe(5);
    expect(august.body.items[0]).toMatchObject({
      regime: 'PRIVATE',
      status: 'INTERRUPTED',
      unitLabel: 'B · 42',
      driver: { id: tenantB.id, name: 'Bruno' },
      chargePoint: { code: 'L1-01' },
    });

    const unit = await get(
      path(
        `sessions?month=2026-08&unit=${encodeURIComponent('B · 42')}&status=CLOSED`,
      ),
      manager,
    ).expect(200);
    expect(unit.body.items).toEqual([
      expect.objectContaining({
        energyKwh: 9.8,
        energyCostCents: 872,
        idleFeeCents: 3000,
        idleMinutes: 120,
        totalCents: 3872,
        anomalyScore: 0.9132,
      }),
    ]);

    const all = await get(path('sessions?page=2&pageSize=4'), manager).expect(
      200,
    );
    expect(all.body).toMatchObject({ total: 6, page: 2, pageSize: 4 });
    expect(all.body.items).toHaveLength(2);
  });

  it('filters the sessions by charge point and anomaly flag', async () => {
    const visitors = await get(
      path(`sessions?chargePointId=${visitorsPointId}`),
      manager,
    ).expect(200);
    expect(visitors.body.total).toBe(1);
    expect(visitors.body.items[0]).toMatchObject({
      regime: 'COMMERCIAL',
      chargePoint: { id: visitorsPointId, code: 'L2-01' },
    });

    const flagged = await get(path('sessions?anomaly=true'), manager).expect(
      200,
    );
    expect(flagged.body.total).toBe(2);
    expect(
      flagged.body.items.map(
        (item: { anomalyScore: number; isAnomaly: boolean }) => [
          item.anomalyScore,
          item.isAnomaly,
        ],
      ),
    ).toEqual([
      [0.6207, true],
      [0.9132, true],
    ]);

    const notFlagged = await get(
      path('sessions?anomaly=false'),
      manager,
    ).expect(200);
    expect(notFlagged.body.total).toBe(4);
    expect(
      notFlagged.body.items.every(
        (item: { isAnomaly: boolean | null }) => item.isAnomaly !== true,
      ),
    ).toBe(true);

    const combined = await get(
      path(
        `sessions?month=2026-08&chargePointId=${privatePointId}&anomaly=true&page=1&pageSize=1`,
      ),
      manager,
    ).expect(200);
    expect(combined.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(combined.body.items).toEqual([
      expect.objectContaining({ unitLabel: 'B · 42', anomalyScore: 0.9132 }),
    ]);

    const secondPage = await get(
      path('sessions?anomaly=true&page=2&pageSize=1'),
      manager,
    ).expect(200);
    expect(secondPage.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(secondPage.body.items).toEqual([
      expect.objectContaining({ anomalyScore: 0.9132 }),
    ]);
  });

  it('summarises the month and the electrical capacity', async () => {
    const response = await get(path('overview?month=2026-08'), manager).expect(
      200,
    );

    expect(response.body).toEqual({
      month: '2026-08',
      energyKwh: 32.652,
      sessionsCount: 5,
      activeSessionsCount: 0,
      costSharingTotalCents: 15_929,
      commercialRevenueCents: 2000,
      unitsWithVehicle: 3,
      unitsWithConsumption: 2,
      capacity: {
        contractedDemandKw: 75,
        commonAreaReserveKw: 11.5,
        chargingDemandKw: 0,
        currentDemandKw: 11.5,
        utilizationPercent: 15.3,
        averagePeakDemandKw: 25.83,
        averagePeakUtilizationPercent: 34.4,
        upgradeRecommended: false,
      },
      energyByWeek: [
        { week: 1, energyKwh: 11.76 },
        { week: 2, energyKwh: 20.892 },
        { week: 3, energyKwh: 0 },
        { week: 4, energyKwh: 0 },
        { week: 5, energyKwh: 0 },
      ],
      anomaliesCount: 2,
      recentAnomalies: [
        {
          sessionId: expect.any(String),
          status: 'CLOSED',
          regime: 'COMMERCIAL',
          chargePoint: {
            id: visitorsPointId,
            code: 'L2-01',
            name: 'Vaga L2-01',
          },
          driver: { id: visitor.id, name: 'Vera' },
          unitLabel: null,
          startedAt: '2026-08-11T00:00:00.000Z',
          endedAt: '2026-08-11T00:20:00.000Z',
          energyKwh: 7.042,
          idleMinutes: 0,
          totalCents: 2000,
          anomalyScore: 0.6207,
          anomalyModelVersion: null,
        },
        expect.objectContaining({
          chargePoint: {
            id: privatePointId,
            code: 'L1-01',
            name: 'Vaga L1-01',
          },
          driver: { id: tenantB.id, name: 'Bruno' },
          unitLabel: 'B · 42',
          anomalyScore: 0.9132,
        }),
      ],
      chargePoints: [
        {
          id: privatePointId,
          code: 'L1-01',
          name: 'Vaga L1-01',
          type: 'PRIVATE',
          maxPowerKw: 7,
          status: 'AVAILABLE',
          pricing: {
            pricePerKwhCents: 89,
            utilityRateCents: 89,
            baseRateCents: null,
            demandFactor: 1,
            demandLevel: 'NORMAL',
            demandFactorSource: 'RULE',
            demandModelVersion: null,
            demandFactorApplied: false,
            idleFeeCentsPerMinute: 25,
            idleFeeCapCents: 3000,
            gracePeriodMinutes: 10,
          },
        },
        expect.objectContaining({
          id: visitorsPointId,
          type: 'COMMERCIAL',
          maxPowerKw: 22,
          pricing: expect.objectContaining({
            pricePerKwhCents: 89,
            demandFactorApplied: true,
          }),
        }),
      ],
    });
  });

  it('lists the latest anomalies up to the end of the month', async () => {
    const july = await get(path('overview?month=2026-07'), manager).expect(200);
    expect(july.body).toMatchObject({ anomaliesCount: 0, recentAnomalies: [] });
    expect(july.body.chargePoints).toHaveLength(2);

    const october = await get(path('overview'), manager).expect(200);
    expect(october.body.anomaliesCount).toBe(0);
    expect(
      october.body.recentAnomalies.map(
        (item: { anomalyScore: number }) => item.anomalyScore,
      ),
    ).toEqual([0.6207, 0.9132]);
  });

  it('shows each driver the statement of their own unit', async () => {
    const response = await get('/me/statements/2026-08', tenantA).expect(200);

    expect(response.body).toEqual({
      organization: { id: organizationId, name: `Residencial ${run}` },
      unitLabel: 'A · 11',
      month: '2026-08',
      status: 'CLOSED',
      closesAt: '2026-09-01T03:00:00.000Z',
      energyKwh: 15.81,
      energyCents: 1407,
      utilityRateCents: 89,
      accessFeeCents: 3500,
      idleFeeCents: 150,
      totalCents: 5057,
      sessionsCount: 2,
      dailyEnergy: Array.from({ length: 31 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        energyKwh: index === 2 ? 11.76 : index === 9 ? 4.05 : 0,
      })),
    });

    const unitB = await get(
      `/me/statements/2026-08?organizationId=${organizationId}`,
      tenantB,
    ).expect(200);
    expect(unitB.body).toMatchObject({
      unitLabel: 'B · 42',
      sessionsCount: 1,
      energyKwh: 9.8,
      totalCents: 7372,
    });

    const current = await get('/me/statements/2026-10', tenantC).expect(200);
    expect(current.body).toMatchObject({
      unitLabel: 'B · 11',
      month: '2026-10',
      status: 'OPEN',
      closesAt: '2026-11-01T03:00:00.000Z',
      sessionsCount: 0,
      energyKwh: 0,
      totalCents: 3500,
    });
  });

  it('hides the driver statement from users without a unit', async () => {
    await get('/me/statements/2026-08').expect(401);
    await get('/me/statements/2026-13', tenantA).expect(400);
    await get('/me/statements/august', tenantA).expect(400);
    await get('/me/statements/2026-08?organizationId=abc', tenantA).expect(400);
    await get(
      `/me/statements/2026-08?organizationId=${randomUUID()}`,
      tenantA,
    ).expect(404);
    await get('/me/statements/2026-08', manager).expect(404);
    await get('/me/statements/2026-08', visitor).expect(404);
  });

  it('defaults to the current month', async () => {
    const response = await get(path('statements'), manager).expect(200);
    expect(response.body.month).toBe('2026-10');
    expect(response.body.totals.sessionsCount).toBe(0);
    expect(response.body.totals.accessFeeCents).toBe(10_500);
  });
});
