import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import {
  buildOcmNetwork,
  type OcmPoi,
  writeOcmNetwork,
} from './../prisma/ocm-network.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
});

const FIXTURE = JSON.parse(
  readFileSync(
    new URL('../prisma/fixtures/ocm-pois.json', import.meta.url),
    'utf8',
  ),
) as OcmPoi[];

describe('Open Charge Map import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  const email = `ocm-${randomUUID()}@example.com`;
  const network = buildOcmNetwork(FIXTURE);
  const operatorIds = network.operators.map((operator) => operator.id);

  async function clean(): Promise<void> {
    await prisma.organization.deleteMany({
      where: { id: { in: operatorIds } },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await clean();
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Olivia', email, password: 'ocm-password-123' })
      .expect(201);
    accessToken = registered.body.accessToken;
  });

  afterAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('creates the operators, points, chargers and tariffs once', async () => {
    const first = await writeOcmNetwork(prisma, network);
    expect(first).toEqual({ operators: 4, created: 6, updated: 0 });

    const second = await writeOcmNetwork(prisma, network);
    expect(second).toEqual({ operators: 4, created: 0, updated: 0 });

    expect(
      await prisma.chargePoint.count({
        where: { organizationId: { in: operatorIds } },
      }),
    ).toBe(6);
    expect(
      await prisma.charger.count({
        where: { chargePoint: { organizationId: { in: operatorIds } } },
      }),
    ).toBe(6);
    expect(
      await prisma.tariff.count({
        where: { organizationId: { in: operatorIds } },
      }),
    ).toBe(4);
    expect(
      await prisma.chargePoint.findFirstOrThrow({
        where: { source: 'OCM', externalId: '1001' },
        include: { chargers: true },
      }),
    ).toMatchObject({
      code: 'OCM-1001',
      type: 'COMMERCIAL',
      isOnline: true,
      chargers: [{ serialNumber: 'GW-OCM-1001', connector: 'CCS_2' }],
    });
  });

  it('updates the coordinates and the status of existing points', async () => {
    const moved = {
      ...network,
      points: network.points.map((point) =>
        point.externalId === '1002'
          ? { ...point, latitude: -22.97, longitude: -43.21, isOnline: true }
          : point,
      ),
    };

    expect(await writeOcmNetwork(prisma, moved)).toMatchObject({
      created: 0,
      updated: 1,
    });
    expect(
      await prisma.chargePoint.findFirstOrThrow({
        where: { source: 'OCM', externalId: '1002' },
      }),
    ).toMatchObject({ latitude: -22.97, longitude: -43.21, isOnline: true });
  });

  it('shows the Open Charge Map attribution on imported points', async () => {
    const point = network.points[0];

    const detail = await request(app.getHttpServer())
      .get(`/charge-points/${point.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body).toMatchObject({
      id: point.id,
      code: 'OCM-1001',
      organizationName: 'Tesla (Tesla-only charging)',
      attribution: 'Dados de localização © Open Charge Map (CC BY-SA 4.0)',
      charger: { connector: 'CCS_2' },
      pricing: { baseRateCents: expect.any(Number) },
    });

    const map = await request(app.getHttpServer())
      .get('/charge-points?bbox=-46.8,-23.7,-46.6,-23.5')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      (map.body as { id: string }[]).find((item) => item.id === point.id),
    ).toMatchObject({ source: 'OCM', connector: 'CCS_2', maxPowerKw: 150 });
  });
});
