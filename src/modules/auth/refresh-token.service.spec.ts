import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { RefreshToken } from '../../generated/prisma/client.js';
import { hashToken, RefreshTokenService } from './refresh-token.service.js';

type NewRefreshToken = Pick<RefreshToken, 'userId' | 'tokenHash' | 'expiresAt'>;

interface TokenFilter {
  id?: string;
  tokenHash?: string;
  userId?: string;
  revokedAt?: null;
}

function matches(token: RefreshToken, where: TokenFilter): boolean {
  return (
    (where.id === undefined || token.id === where.id) &&
    (where.tokenHash === undefined || token.tokenHash === where.tokenHash) &&
    (where.userId === undefined || token.userId === where.userId) &&
    (where.revokedAt === undefined || token.revokedAt === null)
  );
}

function createInMemoryPrisma() {
  const tokens: RefreshToken[] = [];
  return {
    tokens,
    refreshToken: {
      create: vi.fn(({ data }: { data: NewRefreshToken }) => {
        const token: RefreshToken = {
          id: randomUUID(),
          revokedAt: null,
          rotatedAt: null,
          replacedById: null,
          createdAt: new Date(),
          ...data,
        };
        tokens.push(token);
        return Promise.resolve({ ...token });
      }),
      findUnique: vi.fn(({ where }: { where: TokenFilter }) => {
        const token = tokens.find((candidate) => matches(candidate, where));
        return Promise.resolve(token ? { ...token } : null);
      }),
      updateMany: vi.fn(
        ({
          where,
          data,
        }: {
          where: TokenFilter;
          data: Partial<RefreshToken>;
        }) => {
          const matching = tokens.filter((token) => matches(token, where));
          for (const token of matching) {
            Object.assign(token, data);
          }
          return Promise.resolve({ count: matching.length });
        },
      ),
      delete: vi.fn(({ where }: { where: { id: string } }) => {
        const index = tokens.findIndex((token) => token.id === where.id);
        return Promise.resolve(tokens.splice(index, 1)[0]);
      }),
    },
  };
}

describe('RefreshTokenService', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let service: RefreshTokenService;

  beforeEach(() => {
    prisma = createInMemoryPrisma();
    const settings: Partial<Env> = {
      REFRESH_TTL_DAYS: 7,
      REFRESH_REUSE_GRACE_SECONDS: 60,
    };
    const config = {
      get: (key: keyof Env) => settings[key],
    } as unknown as ConfigService<Env, true>;
    service = new RefreshTokenService(
      prisma as unknown as PrismaService,
      config,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues an opaque token and stores only its hash', async () => {
    const token = await service.issue('user-id');

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { data } = prisma.refreshToken.create.mock.calls[0][0];
    expect(data.userId).toBe('user-id');
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.tokenHash).not.toContain(token);
    const ttlMs = data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it('rotates a token and records why and by which token it was replaced', async () => {
    const token = await service.issue('user-id');

    const rotated = await service.rotate(token);

    expect(rotated.userId).toBe('user-id');
    expect(rotated.refreshToken).not.toBe(token);
    const [original, successor] = prisma.tokens;
    expect(original.revokedAt).toBeInstanceOf(Date);
    expect(original.rotatedAt).toEqual(original.revokedAt);
    expect(original.replacedById).toBe(successor.id);
    expect(successor.tokenHash).toBe(hashToken(rotated.refreshToken));
    expect(successor.revokedAt).toBeNull();
  });

  it('accepts two concurrent refreshes with the same token', async () => {
    const token = await service.issue('user-id');

    const [first, second] = await Promise.all([
      service.rotate(token),
      service.rotate(token),
    ]);

    expect(first.userId).toBe('user-id');
    expect(second.userId).toBe('user-id');
    expect(first.refreshToken).not.toBe(second.refreshToken);
    await expect(service.rotate(first.refreshToken)).resolves.toBeDefined();
    await expect(service.rotate(second.refreshToken)).resolves.toBeDefined();
  });

  it('accepts a rotated token again within the grace window', async () => {
    const token = await service.issue('user-id');
    await service.rotate(token);

    const retried = await service.rotate(token);

    expect(retried.userId).toBe('user-id');
    await expect(service.rotate(retried.refreshToken)).resolves.toBeDefined();
  });

  it('accepts a rotated token within the grace window after the chain moved on', async () => {
    const token = await service.issue('user-id');
    const rotated = await service.rotate(token);
    await service.rotate(rotated.refreshToken);

    await expect(service.rotate(token)).resolves.toBeDefined();
  });

  it('rejects a rotated token after the grace window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await service.issue('user-id');
    await service.rotate(token);

    vi.setSystemTime(Date.now() + 61_000);

    await expect(service.rotate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a rotated token after the session was logged out', async () => {
    const token = await service.issue('user-id');
    const rotated = await service.rotate(token);

    await service.revoke(rotated.refreshToken);

    await expect(service.rotate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.rotate(rotated.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a rotated token after every session of the user was revoked', async () => {
    const token = await service.issue('user-id');
    await service.rotate(token);

    await service.revokeAllForUser('user-id');

    await expect(service.rotate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token revoked by logout even within the grace window', async () => {
    const token = await service.issue('user-id');

    await service.revoke(token);

    await expect(service.rotate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.tokens).toHaveLength(1);
  });

  it('rejects expired tokens', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await service.issue('user-id');

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);

    await expect(service.rotate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    await expect(service.rotate('unknown')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('discards the successor when a concurrent logout wins the race', async () => {
    const token = await service.issue('user-id');
    prisma.refreshToken.updateMany.mockImplementationOnce(() => {
      prisma.tokens[0].revokedAt = new Date();
      return Promise.resolve({ count: 0 });
    });

    await expect(service.rotate(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.tokens).toHaveLength(1);
  });

  it('revokes every active token of a user', async () => {
    await service.revokeAllForUser('user-id');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
