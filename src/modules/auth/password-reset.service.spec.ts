import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { verify } from '@node-rs/argon2';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { ConsoleMailSender } from '../mail/console-mail-sender.js';
import { MailOutbox } from '../mail/mail-outbox.js';
import type { UsersService } from '../users/users.service.js';
import type { OneTimeTokenService } from './one-time-token.service.js';
import { PasswordService } from './password.service.js';
import {
  FORGOT_PASSWORD_MINIMUM_DURATION_MS,
  PASSWORD_RESET_TTL_MINUTES,
  PasswordResetService,
} from './password-reset.service.js';
import type { RefreshTokenService } from './refresh-token.service.js';

const user: User = {
  id: 'user-1',
  name: 'Ana',
  email: 'ana@example.com',
  passwordHash: 'old-hash',
  role: 'DRIVER',
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PasswordResetService', () => {
  let users: {
    findByEmail: ReturnType<typeof vi.fn>;
    updatePasswordHash: ReturnType<typeof vi.fn>;
    markEmailVerified: ReturnType<typeof vi.fn>;
  };
  let tokens: {
    issue: ReturnType<typeof vi.fn>;
    consumeByToken: ReturnType<typeof vi.fn>;
  };
  let refreshTokens: { revokeAllForUser: ReturnType<typeof vi.fn> };
  let outbox: MailOutbox;
  let service: PasswordResetService;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
      markEmailVerified: vi.fn().mockResolvedValue(undefined),
    };
    tokens = {
      issue: vi.fn().mockResolvedValue({
        token: 'reset-token',
        expiresAt: new Date(),
      }),
      consumeByToken: vi.fn(),
    };
    refreshTokens = { revokeAllForUser: vi.fn().mockResolvedValue(undefined) };
    outbox = new MailOutbox();
    const config = {
      get: () => 'https://app.evchargeops.com.br',
    } as unknown as ConfigService<Env, true>;
    service = new PasswordResetService(
      users as unknown as UsersService,
      tokens as unknown as OneTimeTokenService,
      new PasswordService(),
      refreshTokens as unknown as RefreshTokenService,
      new ConsoleMailSender(outbox, 'EV ChargeOps <noreply@example.com>'),
      config,
    );
  });

  describe('requestReset', () => {
    it('emails a single use reset link valid for 30 minutes', async () => {
      users.findByEmail.mockResolvedValue(user);

      await service.requestReset(' Ana@Example.com ');

      expect(users.findByEmail).toHaveBeenCalledWith('ana@example.com');
      expect(tokens.issue).toHaveBeenCalledWith(
        'user-1',
        'PASSWORD_RESET',
        PASSWORD_RESET_TTL_MINUTES,
      );
      const message = outbox.lastTo('ana@example.com');
      expect(message?.subject).toBe('Redefina sua senha do EV ChargeOps');
      expect(message?.text).toContain(
        'https://app.evchargeops.com.br/reset-password?token=reset-token',
      );
    });

    it('silently ignores unknown emails after the minimum duration', async () => {
      users.findByEmail.mockResolvedValue(null);
      const startedAt = performance.now();

      await expect(
        service.requestReset('nobody@example.com'),
      ).resolves.toBeUndefined();

      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(
        FORGOT_PASSWORD_MINIMUM_DURATION_MS - 5,
      );
      expect(tokens.issue).not.toHaveBeenCalled();
      expect(outbox.messages).toHaveLength(0);
    });

    it('does not reveal delivery failures', async () => {
      users.findByEmail.mockResolvedValue(user);
      tokens.issue.mockRejectedValue(new Error('database down'));

      await expect(
        service.requestReset('ana@example.com'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('updates the password, verifies the email and revokes sessions', async () => {
      tokens.consumeByToken.mockResolvedValue({
        id: 'token',
        userId: 'user-1',
      });

      await service.resetPassword('reset-token', 'new-password-123');

      expect(tokens.consumeByToken).toHaveBeenCalledWith(
        'PASSWORD_RESET',
        'reset-token',
      );
      const [userId, passwordHash] = users.updatePasswordHash.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(await verify(passwordHash, 'new-password-123')).toBe(true);
      expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('rejects an invalid, expired or used token', async () => {
      tokens.consumeByToken.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'new-password-123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
