import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { MailOutbox } from './../src/modules/mail/mail-outbox.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
});

interface Session {
  id: string;
  email: string;
  accessToken: string;
}

describe('Invites (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let outbox: MailOutbox;
  const run = randomUUID();
  const emails: string[] = [];
  let organizationId: string;
  let organizationName: string;
  let manager: Session;
  let driver: Session;
  let outsider: Session;

  function newEmail(prefix: string): string {
    const email = `${prefix.toLowerCase()}-${run}@example.com`;
    emails.push(email);
    return email;
  }

  async function register(name: string): Promise<Session> {
    const email = newEmail(name.toLowerCase());
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'invite-password-123' })
      .expect(201);
    return {
      id: response.body.user.id,
      email,
      accessToken: response.body.accessToken,
    };
  }

  function as(session: Session | undefined) {
    const server = app.getHttpServer();
    const authorize = (pending: request.Test) =>
      session
        ? pending.set('Authorization', `Bearer ${session.accessToken}`)
        : pending;
    return {
      get: (path: string) => authorize(request(server).get(path)),
      post: (path: string) => authorize(request(server).post(path)),
      delete: (path: string) => authorize(request(server).delete(path)),
    };
  }

  function invitesPath(suffix = ''): string {
    return `/organizations/${organizationId}/invites${suffix}`;
  }

  function lastInviteToken(email: string): string {
    const message = outbox.lastTo(email);
    const token = /\/invite\?token=([A-Za-z0-9_-]+)/.exec(
      message?.text ?? '',
    )?.[1];
    if (!token) {
      throw new Error(`No invite sent to ${email}`);
    }
    return token;
  }

  async function invite(
    email: string,
    unitLabel?: string,
  ): Promise<{ id: string; token: string }> {
    const response = await as(manager)
      .post(invitesPath())
      .send({ email, unitLabel })
      .expect(201);
    return { id: response.body.id, token: lastInviteToken(email) };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(MailOutbox);

    manager = await register('Marta');
    driver = await register('Davi');
    outsider = await register('Olga');
    organizationName = `Residencial ${run}`;
    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        type: 'PRIVATE',
        memberships: {
          create: [
            { userId: manager.id, role: 'MANAGER' },
            { userId: driver.id, role: 'DRIVER', unitLabel: 'A · 1' },
          ],
        },
      },
    });
    organizationId = organization.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('only lets managers of the organization manage invites', async () => {
    const email = newEmail('blocked');

    await as(driver).post(invitesPath()).send({ email }).expect(403);
    await as(driver).get(invitesPath()).expect(403);
    await as(outsider).post(invitesPath()).send({ email }).expect(404);
    await as(undefined).get(invitesPath()).expect(401);
    expect(outbox.lastTo(email)).toBeUndefined();
  });

  it('creates an invite, emails the link and rejects duplicates', async () => {
    const email = newEmail('Nina');
    const response = await as(manager)
      .post(invitesPath())
      .send({ email: email.toUpperCase(), unitLabel: ' B · 42 ' })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      email,
      unitLabel: 'B · 42',
      role: 'DRIVER',
      status: 'PENDING',
      expiresAt: expect.any(String),
      acceptedAt: null,
      createdAt: expect.any(String),
    });
    const days =
      (new Date(response.body.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const message = outbox.lastTo(email);
    expect(message?.subject).toBe(
      `Marta convidou você para o ${organizationName}`,
    );
    expect(message?.text).toContain('Sua unidade: B · 42.');
    expect(message?.text).toContain('/invite?token=');

    const duplicate = await as(manager)
      .post(invitesPath())
      .send({ email })
      .expect(409);
    expect(duplicate.body.code).toBe('INVITE_ALREADY_PENDING');

    const member = await as(manager)
      .post(invitesPath())
      .send({ email: driver.email.toUpperCase() })
      .expect(409);
    expect(member.body.code).toBe('ALREADY_MEMBER');

    await as(manager)
      .post(invitesPath())
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('previews and accepts an invite as a new user', async () => {
    const email = newEmail('Iris');
    const { token, id } = await invite(email, 'C · 7');

    const preview = await as(undefined).get(`/invites/${token}`).expect(200);
    expect(preview.body).toEqual({
      organizationName,
      email,
      unitLabel: 'C · 7',
      expiresAt: expect.any(String),
      status: 'PENDING',
    });

    await as(undefined)
      .post(`/invites/${token}/accept`)
      .send({ name: 'Iris', password: 'short' })
      .expect(400);

    const accepted = await as(undefined)
      .post(`/invites/${token}/accept`)
      .send({ name: ' Iris ', password: 'iris-password-123' })
      .expect(201);
    expect(accepted.body.user).toMatchObject({
      name: 'Iris',
      email,
      role: 'DRIVER',
      emailVerified: true,
    });
    expect(accepted.body.refreshToken).toEqual(expect.any(String));

    const organizations = await as({
      id: accepted.body.user.id,
      email,
      accessToken: accepted.body.accessToken,
    })
      .get('/me/organizations')
      .expect(200);
    expect(organizations.body).toEqual([
      {
        id: organizationId,
        name: organizationName,
        type: 'PRIVATE',
        role: 'DRIVER',
        unitLabel: 'C · 7',
      },
    ]);

    await as(undefined)
      .post('/auth/login')
      .send({ email, password: 'iris-password-123' })
      .expect(200);

    const again = await as(undefined)
      .post(`/invites/${token}/accept`)
      .send({ name: 'Iris', password: 'iris-password-123' })
      .expect(410);
    expect(again.body).toMatchObject({
      statusCode: 410,
      code: 'INVITE_ALREADY_ACCEPTED',
    });

    const afterPreview = await as(undefined)
      .get(`/invites/${token}`)
      .expect(200);
    expect(afterPreview.body.status).toBe('ACCEPTED');

    const list = await as(manager).get(invitesPath()).expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id,
          status: 'ACCEPTED',
          acceptedAt: expect.any(String),
        }),
      ]),
    );

    const stored = await prisma.invite.findUniqueOrThrow({ where: { id } });
    expect(stored.acceptedById).toBe(accepted.body.user.id);
  });

  it('answers 404 for unknown tokens', async () => {
    const response = await as(undefined)
      .get('/invites/unknown-token')
      .expect(404);
    expect(response.body.code).toBe('INVITE_NOT_FOUND');
    await as(undefined)
      .post('/invites/unknown-token/accept')
      .send({ name: 'X', password: 'x-password-123' })
      .expect(404);
  });

  it('rejects expired invites and lets managers resend them', async () => {
    const email = newEmail('Eva');
    const { id, token } = await invite(email);
    await prisma.invite.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const list = await as(manager).get(invitesPath()).expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, status: 'EXPIRED' }),
      ]),
    );
    const expired = await as(undefined)
      .post(`/invites/${token}/accept`)
      .send({ name: 'Eva', password: 'eva-password-123' })
      .expect(410);
    expect(expired.body.code).toBe('INVITE_EXPIRED');

    const resent = await as(manager)
      .post(invitesPath(`/${id}/resend`))
      .expect(200);
    expect(resent.body).toMatchObject({ id, status: 'PENDING' });
    const newToken = lastInviteToken(email);
    expect(newToken).not.toBe(token);

    await as(undefined).get(`/invites/${token}`).expect(404);
    await as(undefined)
      .post(`/invites/${newToken}/accept`)
      .send({ name: 'Eva', password: 'eva-password-123' })
      .expect(201);

    const afterAccept = await as(manager)
      .post(invitesPath(`/${id}/resend`))
      .expect(409);
    expect(afterAccept.body.code).toBe('INVITE_ALREADY_ACCEPTED');
  });

  it('revokes invites', async () => {
    const email = newEmail('Rui');
    const { id, token } = await invite(email);

    await as(manager)
      .delete(invitesPath(`/${id}`))
      .expect(204);
    await as(manager)
      .delete(invitesPath(`/${id}`))
      .expect(204);

    const revoked = await as(undefined)
      .post(`/invites/${token}/accept`)
      .send({ name: 'Rui', password: 'rui-password-123' })
      .expect(410);
    expect(revoked.body.code).toBe('INVITE_REVOKED');

    const list = await as(manager).get(invitesPath()).expect(200);
    expect(list.body.map((item: { id: string }) => item.id)).not.toContain(id);

    const resend = await as(manager)
      .post(invitesPath(`/${id}/resend`))
      .expect(409);
    expect(resend.body.code).toBe('INVITE_REVOKED');

    await as(manager)
      .delete(invitesPath(`/${randomUUID()}`))
      .expect(404);

    await invite(email);
  });

  it('lets an existing user accept with their account', async () => {
    const existing = await register('Beto');
    const { token } = await invite(existing.email.toUpperCase());

    const conflict = await as(undefined)
      .post(`/invites/${token}/accept`)
      .send({ name: 'Beto', password: 'beto-password-123' })
      .expect(409);
    expect(conflict.body.code).toBe('EMAIL_ALREADY_REGISTERED');

    await as(undefined)
      .post(`/invites/${token}/accept-authenticated`)
      .expect(401);

    const mismatch = await as(outsider)
      .post(`/invites/${token}/accept-authenticated`)
      .expect(403);
    expect(mismatch.body.code).toBe('INVITE_EMAIL_MISMATCH');

    await as(existing)
      .post(`/invites/${token}/accept-authenticated`)
      .expect(204);

    const organizations = await as(existing)
      .get('/me/organizations')
      .expect(200);
    expect(organizations.body).toEqual([
      expect.objectContaining({ id: organizationId, role: 'DRIVER' }),
    ]);
    const me = await as(existing).get('/auth/me').expect(200);
    expect(me.body.emailVerified).toBe(true);

    const twice = await as(existing)
      .post(`/invites/${token}/accept-authenticated`)
      .expect(410);
    expect(twice.body.code).toBe('INVITE_ALREADY_ACCEPTED');

    const members = await as(manager)
      .get(`/organizations/${organizationId}/members`)
      .expect(200);
    expect(
      members.body.map((member: { email: string }) => member.email),
    ).toEqual(expect.arrayContaining([existing.email]));
  });
});
