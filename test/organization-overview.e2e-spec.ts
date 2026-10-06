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
  projectedCompletion,
} from './../src/modules/charger-gateway/adapters/mock-charger.adapter.js';

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
const TERMS = {
  utilityRateCents: 89,
  accessFeeCents: 3500,
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
  validFrom: new Date('2026-01-01T00:00:00.000-03:00'),
};

function plusSimulatedMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + (minutes * 60_000) / SPEED);
}

function plusSeconds(from: Date, seconds: number): Date {
  return new Date(from.getTime() + seconds * 1000);
}

describe('Organization overview live data (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let now = PEAK_EVENING;
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let manager: Session;
  let driver: Session;
  let outsider: Session;
  let livePointId: string;
  let otherPointId: string;
  let liveSessionId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'overview-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      accessToken: response.body.accessToken,
    };
  }

  async function overview(): Promise<request.Response> {
    return request(app.getHttpServer())
      .get(`/organizations/${organizationId}/overview`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .expect(200);
  }

  async function closedSession(data: {
    userId: string;
    chargePointId: string;
    unitLabel: string | null;
    startedAt: Date;
    chargingEndedAt: Date;
    allocatedPowerKw: number;
    energyKwh: string;
    energyCostCents: number;
    idleFeeCents?: number;
  }): Promise<void> {
    const idleFeeCents = data.idleFeeCents ?? 0;
    await prisma.chargingSession.create({
      data: {
        ...data,
        organizationId,
        regime: 'PRIVATE',
        status: 'CLOSED',
        lockedRateCents: 89,
        demandFactor: 1,
        demandFactorSource: 'RULE',
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
        gracePeriodMinutes: 10,
        endedAt: data.chargingEndedAt,
        idleFeeCents,
        totalCents: data.energyCostCents + idleFeeCents,
      },
    });
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
    driver = await register('Dora');
    outsider = await register('Olga');

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
            { userId: driver.id, role: 'DRIVER', unitLabel: 'B · 42' },
          ],
        },
        tariffs: { create: TERMS },
      },
    });
    organizationId = organization.id;
    const point = (code: string) =>
      prisma.chargePoint.create({
        data: {
          organizationId,
          code,
          name: `Vaga ${code}`,
          type: 'PRIVATE',
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
    livePointId = (await point('L1-01')).id;
    otherPointId = (await point('L1-02')).id;

    await closedSession({
      userId: driver.id,
      chargePointId: otherPointId,
      unitLabel: 'B · 42',
      startedAt: new Date('2026-09-15T19:00:00.000-03:00'),
      chargingEndedAt: new Date('2026-09-15T20:00:00.000-03:00'),
      allocatedPowerKw: 7,
      energyKwh: '7.000',
      energyCostCents: 623,
      idleFeeCents: 250,
    });
    await closedSession({
      userId: outsider.id,
      chargePointId: otherPointId,
      unitLabel: null,
      startedAt: plusSeconds(PEAK_EVENING, 4),
      chargingEndedAt: plusSeconds(PEAK_EVENING, 20),
      allocatedPowerKw: 7,
      energyKwh: '1.000',
      energyCostCents: 89,
    });

    const started = await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ chargePointId: livePointId, limit: { type: 'ENERGY', value: 3 } })
      .expect(201);
    liveSessionId = started.body.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const completedAt = () =>
    projectedCompletion({
      chargerSerialNumber: 'L1-01',
      transactionId: 'tx',
      startedAt: PEAK_EVENING,
      allocatedPowerKw: 7,
      targetEnergyWh: 3000,
      batteryCapacityWh: MOCK_VEHICLE.batteryCapacityWh,
      initialSocPercent: MOCK_VEHICLE.socPercent,
      timeScale: SPEED,
    })!;

  it('shows the live power and session of each point while charging', async () => {
    now = plusSimulatedMinutes(PEAK_EVENING, 10);

    const response = await overview();

    expect(response.body.chargePoints).toEqual([
      expect.objectContaining({
        id: livePointId,
        status: 'CHARGING',
        currentPowerKw: 7,
        activeSession: {
          sessionId: liveSessionId,
          status: 'ACTIVE',
          graceEndsAt: null,
        },
      }),
      expect.objectContaining({
        id: otherPointId,
        status: 'AVAILABLE',
        currentPowerKw: 0,
        activeSession: null,
      }),
    ]);
    expect(response.body.activeSessionsCount).toBe(1);
  });

  it('compares the month with the previous one and counts visitors', async () => {
    const response = await overview();

    expect(response.body).toMatchObject({
      month: '2026-10',
      sessionsCount: 2,
      energyKwh: 2.167,
      energyCents: 89 + 104,
      totalCents: 89 + 104,
      visitorSessionsCount: 1,
      previousMonth: {
        month: '2026-09',
        energyKwh: 7,
        sessionsCount: 1,
        energyCents: 623,
        totalCents: 873,
      },
    });
  });

  it('finds the peak of simultaneous charging from session power and readings', async () => {
    const response = await overview();

    expect(response.body.monthPeak).toEqual({
      demandKw: 14,
      at: plusSeconds(PEAK_EVENING, 4).toISOString(),
    });
  });

  it('moves the point to the grace period once the battery reaches the limit', async () => {
    const chargedAt = completedAt();
    now = plusSimulatedMinutes(chargedAt, 2);

    const response = await overview();

    expect(response.body.chargePoints[0]).toMatchObject({
      id: livePointId,
      status: 'IDLE',
      currentPowerKw: 0,
      activeSession: {
        sessionId: liveSessionId,
        status: 'GRACE',
        graceEndsAt: plusSimulatedMinutes(chargedAt, 10).toISOString(),
      },
    });
    expect(response.body.energyKwh).toBe(4);
    expect(response.body.monthPeak.demandKw).toBe(14);
  });
});
