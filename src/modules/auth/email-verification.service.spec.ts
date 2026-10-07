import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { ConsoleMailSender } from '../mail/console-mail-sender.js';
import { MailOutbox } from '../mail/mail-outbox.js';
import type { UsersService } from '../users/users.service.js';
import {
  EMAIL_VERIFICATION_TTL_MINUTES,
  EmailVerificationService,
} from './email-verification.service.js';
import type { OneTimeTokenService } from './one-time-token.service.js';

const user: User = {
  id: 'user-1',
  name: 'Ana',
  email: 'ana@example.com',
  passwordHash: 'hash',
  role: 'DRIVER',
  emailVerifiedAt: null,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('EmailVerificationService', () => {
  let users: {
    findById: ReturnType<typeof vi.fn>;
    markEmailVerified: ReturnType<typeof vi.fn>;
  };
  let tokens: {
    issue: ReturnType<typeof vi.fn>;
    consumeByToken: ReturnType<typeof vi.fn>;
  };
  let outbox: MailOutbox;
  let service: EmailVerificationService;

  beforeEach(() => {
    users = {
      findById: vi.fn(),
      markEmailVerified: vi.fn().mockResolvedValue(undefined),
    };
    tokens = {
      issue: vi.fn().mockResolvedValue({
        token: 'raw-token',
        expiresAt: new Date(),
      }),
      consumeByToken: vi.fn(),
    };
    outbox = new MailOutbox();
    const config = {
      get: () => 'https://app.evchargeops.com.br',
    } as unknown as ConfigService<Env, true>;
    service = new EmailVerificationService(
      users as unknown as UsersService,
      tokens as unknown as OneTimeTokenService,
      new ConsoleMailSender(outbox, 'EV ChargeOps <noreply@example.com>'),
      config,
    );
  });

  it('sends a verification link valid for 24 hours', async () => {
    await service.sendVerificationEmail(user);

    expect(tokens.issue).toHaveBeenCalledWith(
      'user-1',
      'EMAIL_VERIFICATION',
      EMAIL_VERIFICATION_TTL_MINUTES,
    );
    const message = outbox.lastTo('ana@example.com');
    expect(message?.subject).toBe('Confirme seu e-mail no EV ChargeOps');
    expect(message?.text).toContain(
      'https://app.evchargeops.com.br/verify-email?token=raw-token',
    );
    expect(message?.text).toContain('24 horas');
  });

  it('does not throw when the email cannot be sent', async () => {
    tokens.issue.mockRejectedValue(new Error('database down'));

    await expect(service.sendVerificationEmail(user)).resolves.toBeUndefined();
    expect(outbox.messages).toHaveLength(0);
  });

  it('marks the email as verified with a valid token', async () => {
    tokens.consumeByToken.mockResolvedValue({ id: 'token', userId: 'user-1' });

    await service.confirm('raw-token');

    expect(tokens.consumeByToken).toHaveBeenCalledWith(
      'EMAIL_VERIFICATION',
      'raw-token',
    );
    expect(users.markEmailVerified).toHaveBeenCalledWith('user-1');
  });

  it('rejects an invalid token', async () => {
    tokens.consumeByToken.mockResolvedValue(null);

    await expect(service.confirm('bad')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.markEmailVerified).not.toHaveBeenCalled();
  });

  it('resends only while the email is not verified', async () => {
    users.findById.mockResolvedValueOnce(user);
    await service.resend('user-1');
    expect(outbox.messages).toHaveLength(1);

    users.findById.mockResolvedValueOnce({
      ...user,
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
    });
    await service.resend('user-1');
    expect(outbox.messages).toHaveLength(1);
  });

  it('rejects resend for a missing user', async () => {
    users.findById.mockResolvedValue(null);

    await expect(service.resend('missing')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
