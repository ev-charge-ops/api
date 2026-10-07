import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { hashToken, RefreshTokenService } from './refresh-token.service.js';

function createPrismaMock() {
  return {
    refreshToken: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('RefreshTokenService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: RefreshTokenService;

  beforeEach(() => {
    prisma = createPrismaMock();
    const config = { get: () => 7 } as unknown as ConfigService<Env, true>;
    service = new RefreshTokenService(
      prisma as unknown as PrismaService,
      config,
    );
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

  it('rejects expired tokens', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.rotate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a token revoked concurrently during rotation', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rotate('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes every active token of a user', async () => {
    await service.revokeAllForUser('user-id');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
