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
  email: string;
  accessToken: string;
}

const PEAK_EVENING = new Date('2026-10-07T19:00:00-03:00');
const TARIFF_START = new Date('2026-01-01T00:00:00-03:00');

describe('Charge points (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clock = { now: () => PEAK_EVENING };
  const run = randomUUID();
  const emails: string[] = [];
  const organizationIds: string[] = [];
  let manager: Session;
  let driver: Session;
  let outsider: Session;
  let condominiumId: string;
  let mallId: string;
  let privatePointId: string;
  let visitorsPointId: string;
  let mallPointId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'charge-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      email,
      accessToken: response.body.accessToken,
    };
  }

  function call(
    method: 'get' | 'patch',
    path: string,
    session?: Session,
  ): request.Test {
    const pending = request(app.getHttpServer())[method](path);
    return session
      ? pending.set('Authorization', `Bearer ${session.accessToken}`)
      : pending;
  }

  async function visibleIds(session: Session): Promise<string[]> {
    const response = await call('get', '/charge-points', session).expect(200);
    return (response.body as { id: string; organizationId: string }[])
      .filter((point) => organizationIds.includes(point.organizationId))
      .map((point) => point.id);
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

    manager = await register('Marta');
    driver = await register('Davi');
    outsider = await register('Olga');

    const condominium = await prisma.organization.create({
      data: {
        name: `Condominio ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: [
            { userId: manager.id, role: 'MANAGER' },
            { userId: driver.id, role: 'DRIVER', unitLabel: 'B · 42' },
          ],
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
    const mall = await prisma.organization.create({
      data: { name: `Shopping ${run}`, type: 'COMMERCIAL' },
    });
    condominiumId = condominium.id;
    mallId = mall.id;
    organizationIds.push(condominiumId, mallId);

    const privatePoint = await prisma.chargePoint.create({
      data: {
        organizationId: condominiumId,
        code: 'L1-01',
        name: 'Garagem L1 · Vaga 12',
        type: 'PRIVATE',
        latitude: -23.56905,
        longitude: -46.63145,
        maxPowerKw: 7,
        chargers: {
          create: { vendor: 'GoodWe HCA G2', serialNumber: `A-${run}` },
        },
      },
    });
    const visitorsPoint = await prisma.chargePoint.create({
      data: {
        organizationId: condominiumId,
        code: 'L2-01',
        name: 'Garagem L2 · Visitantes',
        type: 'COMMERCIAL',
        latitude: -23.5699,
        longitude: -46.6323,
        maxPowerKw: 22,
        tariffs: {
          create: {
            organizationId: condominiumId,
            utilityRateCents: 89,
            baseRateCents: 189,
            accessFeeCents: 0,
            idleFeeCentsPerMinute: 25,
            idleFeeCapCents: 3000,
            gracePeriodMinutes: 10,
            validFrom: TARIFF_START,
          },
        },
      },
    });
    const mallPoint = await prisma.chargePoint.create({
      data: {
        organizationId: mallId,
        code: 'P3-01',
        name: 'Shopping P3',
        type: 'COMMERCIAL',
        latitude: -23.5789,
        longitude: -46.6262,
        maxPowerKw: 22,
        isOnline: false,
      },
    });
    privatePointId = privatePoint.id;
    visitorsPointId = visitorsPoint.id;
    mallPointId = mallPoint.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('requires authentication', async () => {
    await call('get', '/charge-points').expect(401);
    await call('get', `/organizations/${condominiumId}/tariff`).expect(401);
  });

  it('shows members their private points and everyone the commercial ones', async () => {
    expect(await visibleIds(driver)).toEqual([
      privatePointId,
      visitorsPointId,
      mallPointId,
    ]);
    expect(await visibleIds(outsider)).toEqual([visitorsPointId, mallPointId]);
  });

  it('prices private points at the utility rate and commercial ones with the demand factor', async () => {
    const response = await call('get', '/charge-points', driver).expect(200);
    const byId = new Map(
      (response.body as { id: string }[]).map((point) => [point.id, point]),
    );

    expect(byId.get(privatePointId)).toEqual({
      id: privatePointId,
      organizationId: condominiumId,
      organizationName: `Condominio ${run}`,
      code: 'L1-01',
      name: 'Garagem L1 · Vaga 12',
      type: 'PRIVATE',
      latitude: -23.56905,
      longitude: -46.63145,
      maxPowerKw: 7,
      status: 'AVAILABLE',
      isMember: true,
      charger: {
        id: expect.any(String),
        vendor: 'GoodWe HCA G2',
        serialNumber: `A-${run}`,
        connector: 'TYPE_2',
      },
      pricing: {
        pricePerKwhCents: 89,
        utilityRateCents: 89,
        baseRateCents: null,
        demandFactor: 1.5,
        demandLevel: 'PEAK',
        demandFactorSource: 'RULE',
        demandFactorApplied: false,
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
        gracePeriodMinutes: 10,
      },
    });
    expect(byId.get(visitorsPointId)).toMatchObject({
      type: 'COMMERCIAL',
      charger: null,
      pricing: {
        pricePerKwhCents: 284,
        baseRateCents: 189,
        demandFactor: 1.5,
        demandFactorApplied: true,
      },
    });
    expect(byId.get(mallPointId)).toMatchObject({
      status: 'OFFLINE',
      isMember: false,
      pricing: null,
    });
  });

  it('gets a single visible point and hides the others', async () => {
    const response = await call(
      'get',
      `/charge-points/${visitorsPointId}`,
      outsider,
    ).expect(200);
    expect(response.body).toMatchObject({
      id: visitorsPointId,
      isMember: false,
    });

    await call('get', `/charge-points/${privatePointId}`, outsider).expect(404);
    await call('get', `/charge-points/${randomUUID()}`, driver).expect(404);
    await call('get', '/charge-points/not-a-uuid', driver).expect(404);
  });

  it('lets members read the tariff of the organization', async () => {
    const response = await call(
      'get',
      `/organizations/${condominiumId}/tariff`,
      driver,
    ).expect(200);

    expect(response.body).toEqual({
      id: expect.any(String),
      organizationId: condominiumId,
      utilityRateCents: 89,
      baseRateCents: null,
      accessFeeCents: 3500,
      idleFeeCentsPerMinute: 25,
      idleFeeCapCents: 3000,
      gracePeriodMinutes: 10,
      validFrom: TARIFF_START.toISOString(),
    });
    await call(
      'get',
      `/organizations/${condominiumId}/tariff`,
      outsider,
    ).expect(404);
  });

  it('only lets managers change the tariff', async () => {
    await call('patch', `/organizations/${condominiumId}/tariff`, driver)
      .send({ utilityRateCents: 95 })
      .expect(403);
  });

  it('validates the tariff payload', async () => {
    await call('patch', `/organizations/${condominiumId}/tariff`, manager)
      .send({ utilityRateCents: 0.95 })
      .expect(400);
    await call('patch', `/organizations/${condominiumId}/tariff`, manager)
      .send({ idleFeeCapCents: -1 })
      .expect(400);
    await call('patch', `/organizations/${condominiumId}/tariff`, manager)
      .send({ marginPercent: 10 })
      .expect(400);
  });

  it('creates a new tariff version that keeps the untouched terms', async () => {
    const response = await call(
      'patch',
      `/organizations/${condominiumId}/tariff`,
      manager,
    )
      .send({ utilityRateCents: 95, gracePeriodMinutes: 15 })
      .expect(200);

    expect(response.body).toMatchObject({
      utilityRateCents: 95,
      accessFeeCents: 3500,
      idleFeeCentsPerMinute: 25,
      gracePeriodMinutes: 15,
      validFrom: PEAK_EVENING.toISOString(),
    });
    expect(
      await prisma.tariff.count({
        where: { organizationId: condominiumId, chargePointId: null },
      }),
    ).toBe(2);

    const points = await call('get', '/charge-points', driver).expect(200);
    const privatePoint = (
      points.body as { id: string; pricing: { pricePerKwhCents: number } }[]
    ).find((point) => point.id === privatePointId);
    expect(privatePoint?.pricing.pricePerKwhCents).toBe(95);
  });

  it('starts an organization without tariff from the default terms', async () => {
    const response = await call(
      'patch',
      `/organizations/${mallId}/tariff`,
      manager,
    )
      .send({})
      .expect(404);
    expect(response.body.message).toBe('Organization not found');

    await prisma.membership.create({
      data: { userId: manager.id, organizationId: mallId, role: 'MANAGER' },
    });
    await call('get', `/organizations/${mallId}/tariff`, manager).expect(404);
    const created = await call(
      'patch',
      `/organizations/${mallId}/tariff`,
      manager,
    )
      .send({ baseRateCents: 199 })
      .expect(200);
    expect(created.body).toMatchObject({
      utilityRateCents: 89,
      baseRateCents: 199,
      accessFeeCents: 3500,
    });
  });
});
