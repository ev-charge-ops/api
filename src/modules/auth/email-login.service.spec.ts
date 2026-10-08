import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { ConsoleMailSender } from '../mail/console-mail-sender.js';
import { MailOutbox } from '../mail/mail-outbox.js';
import type { UsersService } from '../users/users.service.js';
import type { AuthService } from './auth.service.js';
import {
  EMAIL_LOGIN_TTL_MINUTES,
  EmailLoginService,
} from './email-login.service.js';
import type { OneTimeTokenService } from './one-time-token.service.js';

const user: User = {
  id: 'user-1',
  name: 'Ana',
  email: 'ana@example.com',
  passwordHash: 'hash',
  role: 'DRIVER',
  emailVerifiedAt: null,
  stripeCustomerId: null,
  stripeLiveCustomerId: null,
  paymentMode: 'TEST',
  locationMode: 'DEMO',
  autoRefund: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const session = {
  user: { ...user, emailVerified: true },
  accessToken: 'access',
  refreshToken: 'refresh',
};

describe('EmailLoginService', () => {
  let users: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    markEmailVerified: ReturnType<typeof vi.fn>;
  };
  let tokens: {
    issue: ReturnType<typeof vi.fn>;
    consumeByToken: ReturnType<typeof vi.fn>;
    consumeByCode: ReturnType<typeof vi.fn>;
  };
  let auth: { createSession: ReturnType<typeof vi.fn> };
  let outbox: MailOutbox;
  let service: EmailLoginService;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      findById: vi.fn().mockResolvedValue(user),
      markEmailVerified: vi.fn().mockResolvedValue(undefined),
    };
    tokens = {
      issue: vi.fn().mockResolvedValue({
        token: 'magic-token',
        code: '042817',
        expiresAt: new Date(),
      }),
      consumeByToken: vi.fn(),
      consumeByCode: vi.fn(),
    };
    auth = { createSession: vi.fn().mockResolvedValue(session) };
    outbox = new MailOutbox();
    const config = {
      get: () => 'https://app.evchargeops.com.br',
    } as unknown as ConfigService<Env, true>;
    service = new EmailLoginService(
      users as unknown as UsersService,
      tokens as unknown as OneTimeTokenService,
      auth as unknown as AuthService,
      new ConsoleMailSender(outbox, 'EV ChargeOps <noreply@example.com>'),
      config,
    );
  });

  describe('request', () => {
    it('emails a code and a magic link valid for 10 minutes', async () => {
      users.findByEmail.mockResolvedValue(user);

      await service.request('Ana@Example.com');

      expect(users.findByEmail).toHaveBeenCalledWith('ana@example.com');
      expect(tokens.issue).toHaveBeenCalledWith(
        'user-1',
        'EMAIL_LOGIN',
        EMAIL_LOGIN_TTL_MINUTES,
        { withCode: true },
      );
      const message = outbox.lastTo('ana@example.com');
      expect(message?.subject).toBe('Seu código de acesso ao EV ChargeOps');
      expect(message?.text).toContain('042817');
      expect(message?.text).toContain(
        'https://app.evchargeops.com.br/login/email?token=magic-token',
      );
      expect(message?.text).toContain('10 minutos');
    });

    it('does nothing for unknown emails', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.request('nobody@example.com'),
      ).resolves.toBeUndefined();

      expect(tokens.issue).not.toHaveBeenCalled();
      expect(outbox.messages).toHaveLength(0);
    });
  });

  describe('verify', () => {
    it('logs in with the magic link token', async () => {
      tokens.consumeByToken.mockResolvedValue({ id: 't', userId: 'user-1' });

      await expect(service.verify({ token: 'magic-token' })).resolves.toBe(
        session,
      );

      expect(tokens.consumeByToken).toHaveBeenCalledWith(
        'EMAIL_LOGIN',
        'magic-token',
      );
      expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(auth.createSession).toHaveBeenCalledWith(user);
    });

    it('logs in with email and code', async () => {
      users.findByEmail.mockResolvedValue(user);
      tokens.consumeByCode.mockResolvedValue({ id: 't', userId: 'user-1' });

      await expect(
        service.verify({ email: 'ana@example.com', code: '042817' }),
      ).resolves.toBe(session);

      expect(tokens.consumeByCode).toHaveBeenCalledWith(
        'EMAIL_LOGIN',
        'user-1',
        '042817',
      );
      expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
    });

    it('rejects a wrong code', async () => {
      users.findByEmail.mockResolvedValue(user);
      tokens.consumeByCode.mockResolvedValue(null);

      await expect(
        service.verify({ email: 'ana@example.com', code: '000000' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auth.createSession).not.toHaveBeenCalled();
      expect(users.markEmailVerified).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same error', async () => {
      users.findByEmail.mockResolvedValue(null);

      const error = await service
        .verify({ email: 'nobody@example.com', code: '042817' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        'Invalid or expired code',
      );
      expect(tokens.consumeByCode).not.toHaveBeenCalled();
    });

    it('rejects an invalid token', async () => {
      tokens.consumeByToken.mockResolvedValue(null);

      await expect(
        service.verify({ token: 'bad-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
