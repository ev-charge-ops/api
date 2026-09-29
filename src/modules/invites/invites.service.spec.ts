import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuthService } from '../auth/auth.service.js';
import type { PasswordService } from '../auth/password.service.js';
import { hashToken } from '../auth/refresh-token.service.js';
import type { MailMessage, MailSender } from '../mail/mail-sender.js';
import type { Notifier } from '../notifications/notifier.js';
import type { UsersService } from '../users/users.service.js';
import { INVITE_TTL_DAYS, InvitesService } from './invites.service.js';

const ORGANIZATION_ID = 'organization-1';

function createPrismaMock() {
  return {
    membership: { findFirst: vi.fn().mockResolvedValue(null) },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
    invite: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'invite-1',
          role: 'DRIVER',
          acceptedAt: null,
          acceptedById: null,
          revokedAt: null,
          createdAt: new Date(),
          ...data,
          organization: { id: ORGANIZATION_ID, name: 'Residencial Aclimação' },
          invitedBy: { id: 'manager-1', name: 'Gestor Demo' },
        }),
      ),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('InvitesService.create', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let sent: MailMessage[];
  let send: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;
  let service: InvitesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    sent = [];
    send = vi.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    notify = vi.fn().mockResolvedValue(true);
    service = new InvitesService(
      prisma as unknown as PrismaService,
      {} as UsersService,
      {} as PasswordService,
      {} as AuthService,
      { send } as unknown as MailSender,
      {
        get: () => 'https://app.evchargeops.com.br',
      } as unknown as ConfigService<Env, true>,
      { notify } as unknown as Notifier,
    );
  });

  it('stores only the token hash and emails the invite link', async () => {
    const before = Date.now();

    const invite = await service.create(ORGANIZATION_ID, 'manager-1', {
      email: 'ana@example.com',
      unitLabel: 'B · 42',
    });

    expect(invite).toMatchObject({
      email: 'ana@example.com',
      unitLabel: 'B · 42',
      role: 'DRIVER',
      status: 'PENDING',
    });
    const [{ data }] = prisma.invite.create.mock.calls[0] as [
      { data: { expiresAt: Date; tokenHash: string } },
    ];
    const expiresInDays =
      (data.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(expiresInDays).toBeCloseTo(INVITE_TTL_DAYS, 2);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ana@example.com');
    expect(sent[0].subject).toBe(
      'Gestor Demo convidou você para o Residencial Aclimação',
    );
    const token = /\/invite\?token=([A-Za-z0-9_-]+)/.exec(sent[0].text)?.[1];
    expect(token).toBeDefined();
    expect(data.tokenHash).toBe(hashToken(token ?? ''));
    expect(data.tokenHash).not.toBe(token);
  });

  it('only emails invitees without an account', async () => {
    await service.create(ORGANIZATION_ID, 'manager-1', {
      email: 'ana@example.com',
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('also notifies invitees that already have an account', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-9' });

    await service.create(ORGANIZATION_ID, 'manager-1', {
      email: 'ana@example.com',
      unitLabel: 'B · 42',
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toMatchObject({
      userId: 'user-9',
      type: 'ORGANIZATION_INVITE',
      title: 'Convite de Residencial Aclimação',
      body: 'Gestor Demo convidou você para Residencial Aclimação (unidade B · 42). Abra o link enviado para ana@example.com para aceitar.',
      data: {
        inviteId: 'invite-1',
        organizationId: ORGANIZATION_ID,
        organizationName: 'Residencial Aclimação',
        unitLabel: 'B · 42',
      },
    });
  });

  it('keeps the invite when the invitee lookup fails', async () => {
    prisma.user.findFirst.mockRejectedValue(new Error('database down'));

    await expect(
      service.create(ORGANIZATION_ID, 'manager-1', {
        email: 'ana@example.com',
      }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(prisma.invite.delete).not.toHaveBeenCalled();
  });

  it('rejects emails that already belong to a member', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'membership-1' });

    const error = await service
      .create(ORGANIZATION_ID, 'manager-1', { email: 'ana@example.com' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'ALREADY_MEMBER',
    });
    expect(prisma.invite.create).not.toHaveBeenCalled();
  });

  it('rejects emails with a pending invite', async () => {
    prisma.invite.findFirst.mockResolvedValue({ id: 'invite-0' });

    const error = await service
      .create(ORGANIZATION_ID, 'manager-1', { email: 'ana@example.com' })
      .catch((caught: unknown) => caught);

    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'INVITE_ALREADY_PENDING',
    });
  });

  it('removes the invite when the email cannot be sent', async () => {
    send.mockRejectedValue(new Error('mail down'));

    await expect(
      service.create(ORGANIZATION_ID, 'manager-1', {
        email: 'ana@example.com',
      }),
    ).rejects.toThrow('mail down');
    expect(prisma.invite.delete).toHaveBeenCalledWith({
      where: { id: 'invite-1' },
    });
  });
});
