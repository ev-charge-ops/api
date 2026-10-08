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
const TERMS = {
  utilityRateCents: 89,
  accessFeeCents: 3500,
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
  validFrom: TARIFF_START,
};

function plusSimulatedMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + (minutes * 60_000) / SPEED);
}

describe('Organization session detail (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let now = PEAK_EVENING;
  const run = randomUUID();
  const emails: string[] = [];
  const organizationIds: string[] = [];
  let organizationId: string;
  let otherOrganizationId: string;
  let manager: Session;
  let otherManager: Session;
  let driver: Session;
  let sessionId: string;
  let otherSessionId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'detail-password-123' })
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

  async function createOrganization(
    name: string,
    memberships: {
      userId: string;
      role: 'MANAGER' | 'DRIVER';
      unitLabel?: string;
    }[],
  ): Promise<{ organizationId: string; pointId: string }> {
    const organization = await prisma.organization.create({
      data: {
        name: `${name} ${run}`,
        type: 'PRIVATE',
        contractedDemandKw: 75,
        commonAreaReserveKw: 11.5,
        minChargingPowerKw: 3.7,
        memberships: { create: memberships },
        tariffs: { create: TERMS },
      },
    });
    organizationIds.push(organization.id);
    const point = await prisma.chargePoint.create({
      data: {
        organizationId: organization.id,
        code: 'L1-01',
        name: 'Vaga L1-01',
        type: 'PRIVATE',
        latitude: -23.569,
        longitude: -46.631,
        maxPowerKw: 7,
        isOnline: true,
        chargers: {
          create: {
            vendor: 'GoodWe HCA G2',
            serialNumber: `${name}-${run}`,
          },
        },
      },
    });
    return { organizationId: organization.id, pointId: point.id };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Clock)
      .useValue({ now: () => now })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    manager = await register('Marta');
    otherManager = await register('Otavio');
    driver = await register('Dora');

    const own = await createOrganization('Residencial', [
      { userId: manager.id, role: 'MANAGER' },
      { userId: driver.id, role: 'DRIVER', unitLabel: 'B · 42' },
    ]);
    organizationId = own.organizationId;
    const other = await createOrganization('Condominio', [
      { userId: otherManager.id, role: 'MANAGER' },
    ]);
    otherOrganizationId = other.organizationId;

    const started = await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ chargePointId: own.pointId })
      .expect(201);
    sessionId = started.body.id;

    const closed = await prisma.chargingSession.create({
      data: {
        userId: otherManager.id,
        chargePointId: other.pointId,
        organizationId: otherOrganizationId,
        unitLabel: 'C · 7',
        regime: 'PRIVATE',
        status: 'CLOSED',
        allocatedPowerKw: 7,
        lockedRateCents: 89,
        demandFactor: 1,
        demandFactorSource: 'RULE',
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
        gracePeriodMinutes: 10,
        startedAt: new Date('2026-10-01T19:00:00.000-03:00'),
        chargingEndedAt: new Date('2026-10-01T20:00:00.000-03:00'),
        endedAt: new Date('2026-10-01T20:00:00.000-03:00'),
        energyKwh: '7.000',
        energyCostCents: 623,
        totalCents: 623,
        anomalyScore: '0.9132',
        isAnomaly: true,
        anomalyModelVersion: 'anomaly-test-1',
      },
    });
    otherSessionId = closed.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const path = (organization: string, session: string) =>
    `/organizations/${organization}/sessions/${session}`;

  it('shows the live session of the organization to its manager', async () => {
    now = plusSimulatedMinutes(PEAK_EVENING, 60);

    const response = await get(path(organizationId, sessionId), manager).expect(
      200,
    );

    expect(response.body).toMatchObject({
      id: sessionId,
      organizationId,
      status: 'ACTIVE',
      unitLabel: 'B · 42',
      regime: 'PRIVATE',
      driver: { id: driver.id, name: 'Dora' },
      chargePoint: { code: 'L1-01', name: 'Vaga L1-01' },
      energyKwh: 7,
      powerKw: 7,
      lockedRateCents: 89,
      energyCostCents: 623,
      totalCents: 623,
      anomalyScore: null,
      isAnomaly: null,
      anomalyModelVersion: null,
      payment: null,
    });
    expect(response.body.readings).toHaveLength(12);
    expect(response.body.projectedChargingEndsAt).toEqual(expect.any(String));
  });

  it('includes the anomaly score and model version of closed sessions', async () => {
    const response = await get(
      path(otherOrganizationId, otherSessionId),
      otherManager,
    ).expect(200);

    expect(response.body).toMatchObject({
      id: otherSessionId,
      status: 'CLOSED',
      unitLabel: 'C · 7',
      driver: { id: otherManager.id, name: 'Otavio' },
      energyKwh: 7,
      totalCents: 623,
      anomalyScore: 0.9132,
      isAnomaly: true,
      anomalyModelVersion: 'anomaly-test-1',
      readings: [],
    });
  });

  it('hides sessions of another organization', async () => {
    const response = await get(
      path(organizationId, otherSessionId),
      manager,
    ).expect(404);
    expect(response.body.code).toBe('SESSION_NOT_FOUND');

    await get(path(organizationId, randomUUID()), manager).expect(404);
    await get(path(organizationId, 'not-a-uuid'), manager).expect(404);
    await get(path(otherOrganizationId, otherSessionId), manager).expect(404);
  });

  it('is restricted to managers of the organization', async () => {
    await get(path(organizationId, sessionId)).expect(401);
    await get(path(organizationId, sessionId), driver).expect(403);
    await get(path(organizationId, sessionId), otherManager).expect(404);
  });
});
