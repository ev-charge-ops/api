import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Clock } from './../src/common/clock/clock.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { CURRENT_TERMS_VERSION } from './../src/modules/privacy/domain/consent-purposes.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
});

interface Session {
  id: string;
  accessToken: string;
}

describe('Privacy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let now = new Date('2026-10-07T22:30:00.000-03:00');
  const clock = { now: () => now };
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let driver: Session;
  let other: Session;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'privacy-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      accessToken: response.body.accessToken,
    };
  }

  function call(
    method: 'get' | 'put' | 'post',
    path: string,
    session: Session,
    body?: object,
  ): request.Test {
    const pending = request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${session.accessToken}`);
    return body ? pending.send(body) : pending;
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

    driver = await register('Paula');
    other = await register('Otto');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: { userId: driver.id, role: 'DRIVER', unitLabel: 'C · 7' },
        },
        chargePoints: {
          create: {
            code: 'P1-01',
            name: 'Vaga P1-01',
            type: 'PRIVATE',
            latitude: -23.56,
            longitude: -46.63,
            maxPowerKw: 7,
          },
        },
      },
      include: { chargePoints: true },
    });
    organizationId = organization.id;
    await prisma.chargingSession.create({
      data: {
        userId: driver.id,
        chargePointId: organization.chargePoints[0].id,
        organizationId,
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
        startedAt: new Date('2026-10-01T20:00:00.000-03:00'),
        endedAt: new Date('2026-10-01T22:00:00.000-03:00'),
        energyKwh: 12.5,
        energyCostCents: 1113,
        totalCents: 1113,
      },
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/me/consents').expect(401);
    await request(app.getHttpServer()).put('/me/consents').expect(401);
    await request(app.getHttpServer()).get('/me/data-export').expect(401);
    await request(app.getHttpServer()).post('/me/deletion-request').expect(401);
  });

  it('asks a new user to accept the current terms', async () => {
    const response = await call('get', '/me/consents', driver).expect(200);

    expect(response.body).toMatchObject({
      termsVersion: CURRENT_TERMS_VERSION,
      acceptedTermsVersion: null,
      mustAccept: true,
    });
    expect(
      response.body.purposes.map(
        (item: { purpose: string; required: boolean; granted: boolean }) => [
          item.purpose,
          item.required,
          item.granted,
        ],
      ),
    ).toEqual([
      ['ESSENTIAL_SERVICE', true, false],
      ['BILLING_SHARING', true, false],
      ['USAGE_ANALYTICS', false, false],
      ['MARKETING_COMMUNICATIONS', false, false],
    ]);
    expect(response.body.purposes[1].title).toBe('Rateio com o condomínio');
  });

  it('validates the consent payload', async () => {
    await call('put', '/me/consents', driver, {}).expect(400);
    await call('put', '/me/consents', driver, {
      termsVersion: CURRENT_TERMS_VERSION,
      consents: [{ purpose: 'LOCATION', granted: true }],
    }).expect(400);
    await call('put', '/me/consents', driver, {
      termsVersion: CURRENT_TERMS_VERSION,
      consents: [
        { purpose: 'USAGE_ANALYTICS', granted: true },
        { purpose: 'USAGE_ANALYTICS', granted: false },
      ],
    }).expect(400);

    const outdated = await call('put', '/me/consents', driver, {
      termsVersion: '2020-01-01',
      consents: [],
    }).expect(409);
    expect(outdated.body.code).toBe('TERMS_VERSION_OUTDATED');

    const required = await call('put', '/me/consents', driver, {
      termsVersion: CURRENT_TERMS_VERSION,
      consents: [{ purpose: 'BILLING_SHARING', granted: false }],
    }).expect(400);
    expect(required.body.code).toBe('REQUIRED_CONSENT');
  });

  it('accepts the terms and records the optional choices', async () => {
    const response = await call('put', '/me/consents', driver, {
      termsVersion: CURRENT_TERMS_VERSION,
      consents: [
        { purpose: 'USAGE_ANALYTICS', granted: true },
        { purpose: 'MARKETING_COMMUNICATIONS', granted: false },
      ],
    }).expect(200);

    expect(response.body).toMatchObject({
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
      mustAccept: false,
    });
    expect(
      response.body.purposes.map(
        (item: { purpose: string; granted: boolean; recordedAt: string }) => [
          item.purpose,
          item.granted,
          item.recordedAt,
        ],
      ),
    ).toEqual([
      ['ESSENTIAL_SERVICE', true, now.toISOString()],
      ['BILLING_SHARING', true, now.toISOString()],
      ['USAGE_ANALYTICS', true, now.toISOString()],
      ['MARKETING_COMMUNICATIONS', false, now.toISOString()],
    ]);
  });

  it('appends only the changes to the history', async () => {
    now = new Date('2026-10-08T09:00:00.000-03:00');
    await call('put', '/me/consents', driver, {
      termsVersion: CURRENT_TERMS_VERSION,
      consents: [
        { purpose: 'ESSENTIAL_SERVICE', granted: true },
        { purpose: 'USAGE_ANALYTICS', granted: false },
      ],
    }).expect(200);

    const history = await prisma.consentRecord.findMany({
      where: { userId: driver.id },
      orderBy: [{ createdAt: 'asc' }, { purpose: 'asc' }],
    });
    expect(history.map((record) => [record.purpose, record.granted])).toEqual([
      ['ESSENTIAL_SERVICE', true],
      ['BILLING_SHARING', true],
      ['USAGE_ANALYTICS', true],
      ['MARKETING_COMMUNICATIONS', false],
      ['USAGE_ANALYTICS', false],
    ]);

    const current = await call('get', '/me/consents', driver).expect(200);
    expect(current.body.purposes[2]).toMatchObject({
      purpose: 'USAGE_ANALYTICS',
      granted: false,
      recordedAt: now.toISOString(),
    });
  });

  it('asks again when the accepted terms are older than the current ones', async () => {
    await prisma.consentRecord.updateMany({
      where: { userId: driver.id },
      data: { termsVersion: '2026-01-01' },
    });

    const response = await call('get', '/me/consents', driver).expect(200);
    expect(response.body).toMatchObject({
      acceptedTermsVersion: '2026-01-01',
      mustAccept: true,
    });

    await call('put', '/me/consents', driver, {
      termsVersion: CURRENT_TERMS_VERSION,
      consents: [],
    }).expect(200);
    const accepted = await call('get', '/me/consents', driver).expect(200);
    expect(accepted.body.mustAccept).toBe(false);
  });

  it('records a deletion request once while it is pending', async () => {
    const first = await call('post', '/me/deletion-request', driver, {
      reason: '  Mudei de condomínio  ',
    }).expect(202);
    expect(first.body).toEqual({
      id: expect.any(String),
      status: 'PENDING',
      reason: 'Mudei de condomínio',
      requestedAt: now.toISOString(),
      processedAt: null,
    });

    const again = await call('post', '/me/deletion-request', driver).expect(
      202,
    );
    expect(again.body.id).toBe(first.body.id);
    await call('post', '/me/deletion-request', driver, {
      reason: 'x'.repeat(1001),
    }).expect(400);
    expect(
      await prisma.deletionRequest.count({ where: { userId: driver.id } }),
    ).toBe(1);
  });

  it('exports the data of the user as JSON', async () => {
    const response = await call('get', '/me/data-export', driver).expect(200);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="evchargeops-meus-dados-2026-10-08.json"',
    );
    expect(response.body).toMatchObject({
      exportedAt: now.toISOString(),
      profile: {
        id: driver.id,
        name: 'Paula',
        email: `paula-${run}@example.com`,
        role: 'DRIVER',
        emailVerifiedAt: null,
        identities: [],
      },
      memberships: [
        {
          organization: { id: organizationId, type: 'PRIVATE' },
          role: 'DRIVER',
          unitLabel: 'C · 7',
        },
      ],
      sessions: [
        {
          chargePoint: { code: 'P1-01', name: 'Vaga P1-01' },
          status: 'CLOSED',
          energyKwh: 12.5,
          totalCents: 1113,
          payment: null,
        },
      ],
      deletionRequests: [{ status: 'PENDING' }],
    });
    expect(response.body.consents).toHaveLength(7);
    expect(response.body.profile).not.toHaveProperty('passwordHash');
  });

  it('keeps the data of each user separate', async () => {
    const response = await call('get', '/me/data-export', other).expect(200);

    expect(response.body).toMatchObject({
      profile: { id: other.id },
      memberships: [],
      sessions: [],
      consents: [],
      deletionRequests: [],
    });
  });
});
