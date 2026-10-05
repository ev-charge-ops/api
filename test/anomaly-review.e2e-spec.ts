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

const NOW = new Date('2026-10-07T12:00:00.000-03:00');
const TERMS = {
  utilityRateCents: 89,
  accessFeeCents: 3500,
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
  validFrom: new Date('2026-01-01T00:00:00.000-03:00'),
};

describe('Anomaly review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = randomUUID();
  const emails: string[] = [];
  const organizationIds: string[] = [];
  let organizationId: string;
  let otherOrganizationId: string;
  let manager: Session;
  let otherManager: Session;
  let driver: Session;
  let flaggedId: string;
  let normalId: string;
  let otherFlaggedId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'review-password-123' })
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

  function review(path: string, session?: Session, body?: object) {
    const pending = request(app.getHttpServer()).post(path);
    return (
      session
        ? pending.set('Authorization', `Bearer ${session.accessToken}`)
        : pending
    ).send(body);
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
      },
    });
    return { organizationId: organization.id, pointId: point.id };
  }

  async function closedSession(
    organization: { organizationId: string; pointId: string },
    userId: string,
    isAnomaly: boolean,
  ): Promise<string> {
    const session = await prisma.chargingSession.create({
      data: {
        userId,
        chargePointId: organization.pointId,
        organizationId: organization.organizationId,
        unitLabel: 'B · 42',
        regime: 'PRIVATE',
        status: 'CLOSED',
        allocatedPowerKw: 7,
        lockedRateCents: 89,
        demandFactor: 1,
        demandFactorSource: 'RULE',
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
        gracePeriodMinutes: 10,
        startedAt: new Date('2026-08-10T19:00:00.000-03:00'),
        chargingEndedAt: new Date('2026-08-10T20:00:00.000-03:00'),
        endedAt: new Date('2026-08-10T22:00:00.000-03:00'),
        energyKwh: '7.000',
        energyCostCents: 623,
        idleMinutes: 110,
        idleFeeCents: 2750,
        totalCents: 3373,
        anomalyScore: isAnomaly ? '0.9132' : '0.1204',
        isAnomaly,
        anomalyModelVersion: 'anomaly-test-1',
        anomalyReviewStatus: isAnomaly ? 'PENDING_REVIEW' : null,
      },
    });
    return session.id;
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

    flaggedId = await closedSession(own, driver.id, true);
    normalId = await closedSession(own, driver.id, false);
    otherOrganizationId = other.organizationId;
    otherFlaggedId = await closedSession(other, otherManager.id, true);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const reviewPath = (organization: string, session: string) =>
    `/organizations/${organization}/sessions/${session}/anomaly-review`;
  const sessionsPath = (query = '') =>
    `/organizations/${organizationId}/sessions${query}`;

  it('queues flagged sessions for review', async () => {
    const detail = await get(
      `/organizations/${organizationId}/sessions/${flaggedId}`,
      manager,
    ).expect(200);
    expect(detail.body).toMatchObject({
      isAnomaly: true,
      anomalyReviewStatus: 'PENDING_REVIEW',
      anomalyReviewNote: null,
      anomalyReviewedAt: null,
      anomalyReviewedById: null,
    });

    const pending = await get(
      sessionsPath('?reviewStatus=PENDING_REVIEW'),
      manager,
    ).expect(200);
    expect(pending.body.total).toBe(1);
    expect(pending.body.items[0]).toMatchObject({
      id: flaggedId,
      anomalyReviewStatus: 'PENDING_REVIEW',
      anomalyReviewNote: null,
      anomalyReviewedAt: null,
      anomalyReviewedById: null,
    });

    const all = await get(sessionsPath(), manager).expect(200);
    expect(
      all.body.items.find((item: { id: string }) => item.id === normalId),
    ).toMatchObject({ isAnomaly: false, anomalyReviewStatus: null });

    const overview = await get(
      `/organizations/${organizationId}/overview?month=2026-08`,
      manager,
    ).expect(200);
    expect(overview.body).toMatchObject({
      anomaliesCount: 1,
      anomaliesPendingReviewCount: 1,
    });
    expect(overview.body.recentAnomalies).toEqual([
      expect.objectContaining({
        sessionId: flaggedId,
        anomalyReviewStatus: 'PENDING_REVIEW',
        anomalyReviewNote: null,
        anomalyReviewedAt: null,
        anomalyReviewedById: null,
      }),
    ]);
    await get(sessionsPath('?reviewStatus=MAYBE'), manager).expect(400);
  });

  it('validates the review', async () => {
    const path = reviewPath(organizationId, flaggedId);
    await review(path, manager, {}).expect(400);
    await review(path, manager, { status: 'PENDING_REVIEW' }).expect(400);
    await review(path, manager, { status: 'IGNORED' }).expect(400);
    await review(path, manager, {
      status: 'DISMISSED',
      note: 'x'.repeat(501),
    }).expect(400);
    await review(path, manager, {
      status: 'DISMISSED',
      extra: true,
    }).expect(400);
  });

  it('is restricted to managers of the organization', async () => {
    const body = { status: 'CONFIRMED' };
    await review(reviewPath(organizationId, flaggedId), undefined, body).expect(
      401,
    );
    await review(reviewPath(organizationId, flaggedId), driver, body).expect(
      403,
    );
    await review(
      reviewPath(organizationId, flaggedId),
      otherManager,
      body,
    ).expect(404);
    const foreign = await review(
      reviewPath(organizationId, otherFlaggedId),
      manager,
      body,
    ).expect(404);
    expect(foreign.body.code).toBe('SESSION_NOT_FOUND');
    await review(
      reviewPath(otherOrganizationId, otherFlaggedId),
      manager,
      body,
    ).expect(404);
    await review(
      reviewPath(organizationId, randomUUID()),
      manager,
      body,
    ).expect(404);
    await review(
      reviewPath(organizationId, 'not-a-uuid'),
      manager,
      body,
    ).expect(404);
  });

  it('refuses to review sessions that are not flagged', async () => {
    const response = await review(
      reviewPath(organizationId, normalId),
      manager,
      {
        status: 'CONFIRMED',
      },
    ).expect(409);

    expect(response.body.code).toBe('SESSION_NOT_FLAGGED');
  });

  it('dismisses a flagged session without changing its billing', async () => {
    const response = await review(
      reviewPath(organizationId, flaggedId),
      manager,
      { status: 'DISMISSED', note: '  Carga de visitante autorizada  ' },
    ).expect(200);

    expect(response.body).toMatchObject({
      id: flaggedId,
      status: 'CLOSED',
      driver: { id: driver.id, name: 'Dora' },
      isAnomaly: true,
      anomalyScore: 0.9132,
      anomalyReviewStatus: 'DISMISSED',
      anomalyReviewNote: 'Carga de visitante autorizada',
      anomalyReviewedAt: NOW.toISOString(),
      anomalyReviewedById: manager.id,
      energyCostCents: 623,
      idleFeeCents: 2750,
      totalCents: 3373,
    });
    const stored = await prisma.chargingSession.findUniqueOrThrow({
      where: { id: flaggedId },
    });
    expect(stored).toMatchObject({
      anomalyReviewStatus: 'DISMISSED',
      anomalyReviewedById: manager.id,
      totalCents: 3373,
      isAnomaly: true,
    });

    const dismissed = await get(
      sessionsPath('?reviewStatus=DISMISSED&anomaly=true'),
      manager,
    ).expect(200);
    expect(dismissed.body.items).toEqual([
      expect.objectContaining({
        id: flaggedId,
        anomalyReviewStatus: 'DISMISSED',
        anomalyReviewNote: 'Carga de visitante autorizada',
        anomalyReviewedById: manager.id,
        totalCents: 3373,
      }),
    ]);
    const pending = await get(
      sessionsPath('?reviewStatus=PENDING_REVIEW'),
      manager,
    ).expect(200);
    expect(pending.body.total).toBe(0);

    const overview = await get(
      `/organizations/${organizationId}/overview?month=2026-08`,
      manager,
    ).expect(200);
    expect(overview.body).toMatchObject({
      anomaliesCount: 1,
      anomaliesPendingReviewCount: 0,
      costSharingTotalCents: 3373 + 3373 + 3500,
    });
    expect(overview.body.recentAnomalies[0]).toMatchObject({
      sessionId: flaggedId,
      anomalyReviewStatus: 'DISMISSED',
      anomalyReviewNote: 'Carga de visitante autorizada',
      anomalyReviewedAt: NOW.toISOString(),
      anomalyReviewedById: manager.id,
    });
  });

  it('lets the manager change the decision', async () => {
    const response = await review(
      reviewPath(organizationId, flaggedId),
      manager,
      { status: 'CONFIRMED' },
    ).expect(200);

    expect(response.body).toMatchObject({
      anomalyReviewStatus: 'CONFIRMED',
      anomalyReviewNote: null,
      anomalyReviewedById: manager.id,
    });
  });
});
