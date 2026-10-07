import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '100';
});

interface Session {
  id: string;
  email: string;
  accessToken: string;
}

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const run = randomUUID();
  const organizationIds: string[] = [];
  const emails: string[] = [];
  let manager: Session;
  let driver: Session;
  let outsider: Session;
  let organizationId: string;

  async function register(name: string): Promise<Session> {
    const email = `${name.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'org-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      email,
      accessToken: response.body.accessToken,
    };
  }

  function get(path: string, session?: Session) {
    const pending = request(app.getHttpServer()).get(path);
    return session
      ? pending.set('Authorization', `Bearer ${session.accessToken}`)
      : pending;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    manager = await register('Manuela');
    driver = await register('Diego');
    outsider = await register('Otto');

    const organization = await prisma.organization.create({
      data: {
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        memberships: {
          create: [
            { userId: manager.id, role: 'MANAGER' },
            { userId: driver.id, role: 'DRIVER', unitLabel: 'B · 42' },
          ],
        },
      },
    });
    const other = await prisma.organization.create({
      data: {
        name: `Alpha Park ${run}`,
        type: 'COMMERCIAL',
        memberships: { create: [{ userId: driver.id, role: 'MANAGER' }] },
      },
    });
    organizationId = organization.id;
    organizationIds.push(organization.id, other.id);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('lists the organizations of the current user with their role', async () => {
    const response = await get('/me/organizations', driver).expect(200);

    expect(response.body).toEqual([
      {
        id: organizationIds[1],
        name: `Alpha Park ${run}`,
        type: 'COMMERCIAL',
        role: 'MANAGER',
        unitLabel: null,
      },
      {
        id: organizationId,
        name: `Residencial ${run}`,
        type: 'PRIVATE',
        role: 'DRIVER',
        unitLabel: 'B · 42',
      },
    ]);
  });

  it('returns an empty list for users without organizations', async () => {
    const response = await get('/me/organizations', outsider).expect(200);

    expect(response.body).toEqual([]);
  });

  it('requires authentication', async () => {
    await get('/me/organizations').expect(401);
    await get(`/organizations/${organizationId}/members`).expect(401);
  });

  it('lists members for managers of the organization', async () => {
    const response = await get(
      `/organizations/${organizationId}/members`,
      manager,
    ).expect(200);

    expect(response.body).toEqual([
      {
        userId: manager.id,
        name: 'Manuela',
        email: manager.email,
        role: 'MANAGER',
        unitLabel: null,
        joinedAt: expect.any(String),
      },
      {
        userId: driver.id,
        name: 'Diego',
        email: driver.email,
        role: 'DRIVER',
        unitLabel: 'B · 42',
        joinedAt: expect.any(String),
      },
    ]);
  });

  it('forbids members without the manager role', async () => {
    await get(`/organizations/${organizationId}/members`, driver).expect(403);
  });

  it('answers 404 to non members and unknown organizations', async () => {
    await get(`/organizations/${organizationId}/members`, outsider).expect(404);
    await get(`/organizations/${randomUUID()}/members`, manager).expect(404);
    await get('/organizations/not-a-uuid/members', manager).expect(404);
  });
});
