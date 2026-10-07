import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { verify } from '@node-rs/argon2';
import type { Clock } from '../../common/clock/clock.js';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { ConsoleMailSender } from '../mail/console-mail-sender.js';
import { MailOutbox } from '../mail/mail-outbox.js';
import type { MailSender } from '../mail/mail-sender.js';
import { UserResponseDto } from '../users/dto/user.response.dto.js';
import type { UsersService } from '../users/users.service.js';
import { AccountService } from './account.service.js';
import type { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import type { RefreshTokenService } from './refresh-token.service.js';

const passwords = new PasswordService();

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@example.com',
    passwordHash: null,
    role: 'DRIVER',
    emailVerifiedAt: new Date(),
    stripeCustomerId: null,
    stripeLiveCustomerId: null,
    paymentMode: 'TEST',
    locationMode: 'DEMO',
    autoRefund: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function expectErrorCode(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toMatchObject({ code });
}

describe('AccountService', () => {
  let users: {
    findById: ReturnType<typeof vi.fn>;
    updateName: ReturnType<typeof vi.fn>;
    updatePasswordHash: ReturnType<typeof vi.fn>;
  };
  let refreshTokens: { revokeAllForUser: ReturnType<typeof vi.fn> };
  let auth: { createSession: ReturnType<typeof vi.fn> };
  let outbox: MailOutbox;
  let mail: MailSender;
  let service: AccountService;
  const changedAt = new Date('2026-10-07T19:05:00.000Z');

  function createService(): AccountService {
    return new AccountService(
      users as unknown as UsersService,
      passwords,
      refreshTokens as unknown as RefreshTokenService,
      auth as unknown as AuthService,
      mail,
      { now: () => changedAt } as Clock,
      {
        get: () => 'https://app.evchargeops.com.br',
      } as unknown as ConfigService<Env, true>,
    );
  }

  beforeEach(() => {
    users = {
      findById: vi.fn(),
      updateName: vi.fn(),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
    };
    refreshTokens = { revokeAllForUser: vi.fn().mockResolvedValue(undefined) };
    auth = {
      createSession: vi.fn((user: User) =>
        Promise.resolve({
          user: UserResponseDto.fromEntity(user),
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        }),
      ),
    };
    outbox = new MailOutbox();
    mail = new ConsoleMailSender(outbox, 'EV ChargeOps <noreply@example.com>');
    service = createService();
  });

  describe('updateProfile', () => {
    it('renames the user and returns the profile', async () => {
      const user = buildUser();
      users.findById.mockResolvedValue(user);
      users.updateName.mockResolvedValue({ ...user, name: 'Ana Souza' });

      const profile = await service.updateProfile('user-1', {
        name: 'Ana Souza',
      });

      expect(users.updateName).toHaveBeenCalledWith('user-1', 'Ana Souza');
      expect(profile).toEqual({
        id: 'user-1',
        name: 'Ana Souza',
        email: 'ana@example.com',
        role: 'DRIVER',
        emailVerified: true,
        hasPassword: false,
        paymentMode: 'TEST',
        locationMode: 'DEMO',
        autoRefund: false,
      });
    });

    it('rejects a user that no longer exists', async () => {
      users.findById.mockResolvedValue(null);

      await expect(
        service.updateProfile('user-1', { name: 'Ana Souza' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.updateName).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('replaces the password, revokes every session and returns a new one', async () => {
      users.findById.mockResolvedValue(
        buildUser({ passwordHash: await passwords.hash('old-password-1') }),
      );

      const session = await service.changePassword('user-1', {
        currentPassword: 'old-password-1',
        newPassword: 'new-password-2',
      });

      const [userId, storedHash] = users.updatePasswordHash.mock.calls[0] as [
        string,
        string,
      ];
      expect(userId).toBe('user-1');
      expect(await verify(storedHash, 'new-password-2')).toBe(true);
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(
        refreshTokens.revokeAllForUser.mock.invocationCallOrder[0],
      ).toBeLessThan(auth.createSession.mock.invocationCallOrder[0]);
      expect(session).toMatchObject({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        user: { hasPassword: true },
      });
    });

    it('sends the security email in pt-BR', async () => {
      users.findById.mockResolvedValue(
        buildUser({ passwordHash: await passwords.hash('old-password-1') }),
      );

      await service.changePassword('user-1', {
        currentPassword: 'old-password-1',
        newPassword: 'new-password-2',
      });

      const message = outbox.lastTo('ana@example.com');
      expect(message?.subject).toBe('Sua senha foi alterada');
      expect(message?.text).toContain('07/10/2026 às 16:05');
      expect(message?.text).toContain(
        'https://app.evchargeops.com.br/forgot-password',
      );
    });

    it.each([
      ['a wrong', 'wrong-password'],
      ['a missing', undefined],
    ])(
      'rejects %s current password without changing anything',
      async (_label, currentPassword) => {
        users.findById.mockResolvedValue(
          buildUser({ passwordHash: await passwords.hash('old-password-1') }),
        );

        const error: unknown = await service
          .changePassword('user-1', {
            currentPassword,
            newPassword: 'new-password-2',
          })
          .catch((caught: unknown) => caught);

        expectErrorCode(error, 400, 'INVALID_CURRENT_PASSWORD');
        expect(users.updatePasswordHash).not.toHaveBeenCalled();
        expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
        expect(outbox.messages).toHaveLength(0);
      },
    );

    it('creates the first password of an account without one', async () => {
      users.findById.mockResolvedValue(buildUser());

      const session = await service.changePassword('user-1', {
        newPassword: 'first-password-1',
      });

      expect(users.updatePasswordHash).toHaveBeenCalledTimes(1);
      expect(session.user.hasPassword).toBe(true);
    });

    it('keeps the new session when the security email fails', async () => {
      const logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      mail = { send: vi.fn().mockRejectedValue(new Error('down')) };
      service = createService();
      users.findById.mockResolvedValue(buildUser());

      await expect(
        service.changePassword('user-1', { newPassword: 'first-password-1' }),
      ).resolves.toMatchObject({ refreshToken: 'new-refresh' });
      expect(logError).toHaveBeenCalledWith(
        'Failed to send password changed email',
        expect.any(String),
      );
      logError.mockRestore();
    });
  });
});
