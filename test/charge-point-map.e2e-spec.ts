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

interface MapItem {
  id: string;
  code: string;
}

const PEAK_EVENING = new Date('2026-10-07T19:00:00-03:00');
const TARIFF_START = new Date('2026-01-01T00:00:00-03:00');
const PHOTO_URL = 'https://app.evchargeops.com.br/media/points/garage-a.webp';
const VIEWPORT = '-30.5,-8,-29.5,-7';
const NETWORK_SIZE = 205;

describe('Charge point map (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clock = { now: () => PEAK_EVENING };
  const run = randomUUID();
  const emails: string[] = [];
  const organizationIds: string[] = [];
  let owner: Session;
  let stranger: Session;
  let far: Session;
  let condoPointId: string;
  let farCondoPointId: string;
  const pointIds: Record<string, string> = {};

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'map-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      accessToken: response.body.accessToken,
    };
  }

  function get(path: string, session: Session): request.Test {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${session.accessToken}`);
  }

  async function mapCodes(session: Session, query: string): Promise<string[]> {
    const response = await get(`/charge-points?${query}`, session).expect(200);
    return (response.body as MapItem[]).map((item) => item.code);
  }

  async function condo(
    name: string,
    member: Session,
    latitude: number,
    longitude: number,
  ): Promise<string> {
    const organization = await prisma.organization.create({
      data: {
        name: `${name} ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: { userId: member.id, role: 'DRIVER', unitLabel: 'A · 1' },
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
        chargePoints: {
          create: {
            code: 'P-01',
            name: `${name} · Vaga 1`,
            type: 'PRIVATE',
            latitude,
            longitude,
            maxPowerKw: 7,
          },
        },
      },
      include: { chargePoints: true },
    });
    organizationIds.push(organization.id);
    return organization.chargePoints[0].id;
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

    owner = await register('Otto');
    stranger = await register('Sara');
    far = await register('Bia');

    condoPointId = await condo('Condominio', owner, -7.5, -30);
    farCondoPointId = await condo('Ilha', far, -6.5, -29);

    const operator = await prisma.organization.create({
      data: {
        name: `Operadora ${run}`,
        type: 'COMMERCIAL',
        tariffs: {
          create: {
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
    organizationIds.push(operator.id);
    const point = async (
      code: string,
      latitude: number,
      longitude: number,
      isOnline = true,
    ) => {
      const created = await prisma.chargePoint.create({
        data: {
          organizationId: operator.id,
          code,
          name: `Eletroposto ${code}`,
          type: 'COMMERCIAL',
          latitude,
          longitude,
          maxPowerKw: 22,
          isOnline,
          photoUrl: PHOTO_URL,
          chargers: {
            create: {
              vendor: 'GoodWe HCA G2',
              serialNumber: `${code}-${run}`,
              connector: 'CCS_2',
            },
          },
        },
      });
      pointIds[code] = created.id;
    };
    await point('C-01', -7.5, -30.001);
    await point('C-02', -7.6, -30.1, false);
    await point('C-03', -7.9, -30.4);

    const network = await prisma.organization.create({
      data: { name: `Rede ${run}`, type: 'COMMERCIAL' },
    });
    organizationIds.push(network.id);
    await prisma.chargePoint.createMany({
      data: Array.from({ length: NETWORK_SIZE }, (_, index) => ({
        organizationId: network.id,
        code: `N-${String(index).padStart(3, '0')}`,
        name: `Rede · ${index}`,
        type: 'COMMERCIAL' as const,
        latitude: -6.5 + (index % 15) * 0.002,
        longitude: -29 + Math.floor(index / 15) * 0.002,
        maxPowerKw: 50,
      })),
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('returns light map items inside the viewport, nearest to the center first', async () => {
    const response = await get(`/charge-points?bbox=${VIEWPORT}`, owner).expect(
      200,
    );

    expect((response.body as MapItem[]).map((item) => item.code)).toEqual([
      'P-01',
      'C-01',
      'C-02',
      'C-03',
    ]);
    const [privatePoint, nearest, offline] = response.body;
    expect(nearest).toEqual({
      id: pointIds['C-01'],
      code: 'C-01',
      name: 'Eletroposto C-01',
      type: 'COMMERCIAL',
      status: 'AVAILABLE',
      latitude: -7.5,
      longitude: -30.001,
      maxPowerKw: 22,
      connector: 'CCS_2',
      operatorName: `Operadora ${run}`,
      basePricePerKwhCents: 189,
      pricePerKwhCents: 189,
      photoUrl: PHOTO_URL,
      source: 'SEED',
    });
    expect(privatePoint).toMatchObject({
      id: condoPointId,
      type: 'PRIVATE',
      connector: null,
      operatorName: `Condominio ${run}`,
      basePricePerKwhCents: 89,
      pricePerKwhCents: 89,
      photoUrl: null,
    });
    expect(offline).toMatchObject({ code: 'C-02', status: 'OFFLINE' });
  });

  it('hides private points of other organizations and honours the limit', async () => {
    expect(await mapCodes(stranger, `bbox=${VIEWPORT}`)).toEqual([
      'C-01',
      'C-02',
      'C-03',
    ]);
    expect(await mapCodes(owner, `bbox=${VIEWPORT}&limit=2`)).toEqual([
      'P-01',
      'C-01',
    ]);
    expect(await mapCodes(owner, 'bbox=-10,-1,-9,0')).toEqual([]);
  });

  it('validates the viewport and the limit', async () => {
    await get('/charge-points?bbox=-30.5,-8,-29.5', owner).expect(400);
    await get('/charge-points?bbox=-29.5,-8,-30.5,-7', owner).expect(400);
    await get(`/charge-points?bbox=${VIEWPORT}&limit=1001`, owner).expect(400);
    await get(`/charge-points?bbox=${VIEWPORT}&limit=0`, owner).expect(400);
    await get(
      `/charge-points?bbox=${VIEWPORT}&organizationId=${randomUUID()}`,
      owner,
    ).expect(400);
  });

  it('groups the points in a grid that follows the zoom', async () => {
    const world = await get(
      `/charge-points/clusters?bbox=${VIEWPORT}&zoom=0`,
      owner,
    ).expect(200);
    expect(world.body).toEqual([
      {
        latitude: expect.closeTo(-7.625, 6),
        longitude: expect.closeTo(-30.12525, 6),
        count: 4,
        availableCount: 3,
      },
    ]);

    const outsider = await get(
      `/charge-points/clusters?bbox=${VIEWPORT}&zoom=0`,
      stranger,
    ).expect(200);
    expect(outsider.body).toMatchObject([{ count: 3, availableCount: 2 }]);

    const city = await get(
      `/charge-points/clusters?bbox=${VIEWPORT}&zoom=9`,
      owner,
    ).expect(200);
    expect(city.body).toEqual([
      {
        latitude: -7.5,
        longitude: expect.closeTo(-30.0005, 6),
        count: 2,
        availableCount: 2,
      },
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 1 }),
    ]);
  });

  it('validates the cluster query', async () => {
    await get(`/charge-points/clusters?bbox=${VIEWPORT}`, owner).expect(400);
    await get(`/charge-points/clusters?zoom=5`, owner).expect(400);
    await get(`/charge-points/clusters?bbox=${VIEWPORT}&zoom=23`, owner).expect(
      400,
    );
  });

  describe('without a viewport (app 1.4.0)', () => {
    async function ownIds(session: Session): Promise<string[]> {
      const response = await get('/charge-points', session).expect(200);
      return (response.body as { id: string; organizationId: string }[])
        .filter((point) => organizationIds.includes(point.organizationId))
        .map((point) => point.id);
    }

    it('lists the condo points and the commercial points within 25 km of the condo', async () => {
      expect(await ownIds(owner)).toEqual([
        condoPointId,
        pointIds['C-01'],
        pointIds['C-02'],
      ]);
    });

    it('centers drivers without a condo on São Paulo', async () => {
      expect(await ownIds(stranger)).toEqual([]);
    });

    it('caps the list at 200 points, keeping the private ones', async () => {
      const response = await get('/charge-points', far).expect(200);

      expect(response.body).toHaveLength(200);
      expect(response.body[0]).toMatchObject({
        id: farCondoPointId,
        type: 'PRIVATE',
        isMember: true,
      });
    });

    it('keeps the full list of a single organization', async () => {
      const response = await get(
        `/charge-points?organizationId=${organizationIds[3]}`,
        far,
      ).expect(200);

      expect(response.body).toHaveLength(NETWORK_SIZE);
    });
  });
});
