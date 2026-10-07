import { randomUUID } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { RefreshToken, User } from '../../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { EmailVerificationService } from './email-verification.service.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

type NewUser = Pick<User, 'name' | 'email' | 'passwordHash'>;
type NewRefreshToken = Pick<RefreshToken, 'userId' | 'tokenHash' | 'expiresAt'>;

function createInMemoryPrisma() {
  const users: User[] = [];
  const refreshTokens: RefreshToken[] = [];

  return {
    users,
    refreshTokens,
    user: {
      findUnique: ({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(
          users.find(
            (user) =>
              (where.id === undefined || user.id === where.id) &&
              (where.email === undefined || user.email === where.email),
          ) ?? null,
        ),
      create: ({ data }: { data: NewUser }) => {
        const user: User = {
          id: randomUUID(),
          role: 'DRIVER',
          emailVerifiedAt: null,
          stripeCustomerId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        users.push(user);
        return Promise.resolve(user);
      },
    },
    refreshToken: {
      create: ({ data }: { data: NewRefreshToken }) => {
        const token: RefreshToken = {
          id: randomUUID(),
          revokedAt: null,
          createdAt: new Date(),
          ...data,
        };
        refreshTokens.push(token);
        return Promise.resolve(token);
      },
      findUnique: ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          refreshTokens.find((token) => token.tokenHash === where.tokenHash) ??
            null,
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: { id?: string; tokenHash?: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        const matching = refreshTokens.filter(
          (token) =>
            (where.id === undefined || token.id === where.id) &&
            (where.tokenHash === undefined ||
              token.tokenHash === where.tokenHash) &&
            token.revokedAt === null,
        );
        for (const token of matching) {
          token.revokedAt = data.revokedAt;
        }
        return Promise.resolve({ count: matching.length });
      },
    },
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let jwt: JwtService;
  let service: AuthService;
  let emailVerification: { sendVerificationEmail: ReturnType<typeof vi.fn> };

  const registration = {
    name: 'Ana Souza',
    email: 'Ana@Example.com',
    password: 'correct-horse',
  };

  beforeEach(() => {
    prisma = createInMemoryPrisma();
    const prismaService = prisma as unknown as PrismaService;
    const config = { get: () => 7 } as unknown as ConfigService<Env, true>;
    jwt = new JwtService({ secret: 'test-secret' });
    emailVerification = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      new UsersService(prismaService),
      new PasswordService(),
      new RefreshTokenService(prismaService, config),
      jwt,
      emailVerification as unknown as EmailVerificationService,
    );
  });

  describe('register', () => {
    it('stores an argon2id hash instead of the plain password', async () => {
      const result = await service.register(registration);

      const [stored] = prisma.users;
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.passwordHash).not.toContain(registration.password);
      expect(result.user).toEqual({
        id: stored.id,
        name: 'Ana Souza',
        email: 'ana@example.com',
        role: 'DRIVER',
        emailVerified: false,
        hasPassword: true,
      });
    });

    it('sends the verification email to the new user', async () => {
      await service.register(registration);

      expect(emailVerification.sendVerificationEmail).toHaveBeenCalledWith(
        prisma.users[0],
      );
    });

    it('issues an access token carrying the user id and role', async () => {
      const result = await service.register(registration);

      const payload = await jwt.verifyAsync<{ sub: string; role: string }>(
        result.accessToken,
      );
      expect(payload.sub).toBe(result.user.id);
      expect(payload.role).toBe('DRIVER');
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('rejects an email that is already registered', async () => {
      await service.register(registration);

      await expect(
        service.register({ ...registration, email: 'ana@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.users).toHaveLength(1);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register(registration);
    });

    it('returns a session for valid credentials', async () => {
      const result = await service.login({
        email: 'ana@example.com',
        password: registration.password,
      });

      expect(result.user.email).toBe('ana@example.com');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with the same error as an unknown email', async () => {
      const [wrongPasswordError, unknownEmailError] = await Promise.all([
        service
          .login({ email: 'ana@example.com', password: 'wrong-password' })
          .catch((error: unknown) => error),
        service
          .login({
            email: 'nobody@example.com',
            password: registration.password,
          })
          .catch((error: unknown) => error),
      ]);

      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(
        (wrongPasswordError as UnauthorizedException).getResponse(),
      ).toEqual((unknownEmailError as UnauthorizedException).getResponse());
    });
  });

  describe('login without password', () => {
    it('rejects a user without password with the generic error after a dummy hash check', async () => {
      prisma.users.push({
        id: randomUUID(),
        name: 'OAuth Only',
        email: 'oauth@example.com',
        passwordHash: null,
        role: 'DRIVER',
        emailVerifiedAt: new Date(),
        stripeCustomerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const dummy = vi.spyOn(PasswordService.prototype, 'verifyAgainstDummy');

      const error = await service
        .login({ email: 'oauth@example.com', password: 'any-password' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual(
        new UnauthorizedException('Invalid credentials').getResponse(),
      );
      expect(dummy).toHaveBeenCalledWith('any-password');
      dummy.mockRestore();
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and rejects reuse of the old one', async () => {
      const session = await service.register(registration);

      const refreshed = await service.refresh(session.refreshToken);

      expect(refreshed.refreshToken).not.toBe(session.refreshToken);
      expect(refreshed.user.id).toBe(session.user.id);
      await expect(
        service.refresh(session.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        service.refresh(refreshed.refreshToken),
      ).resolves.toBeDefined();
    });

    it('rejects an unknown refresh token', async () => {
      await expect(service.refresh('unknown-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const session = await service.register(registration);

      await service.logout(session.refreshToken);

      expect(prisma.refreshTokens[0].revokedAt).toBeInstanceOf(Date);
      await expect(
        service.refresh(session.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('rejects a user that no longer exists', async () => {
      await expect(service.getProfile('missing-id')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
