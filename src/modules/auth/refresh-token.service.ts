import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';

const TOKEN_BYTES = 32;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: string;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(userId: string): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlDays * DAY_IN_MS),
      },
    });
    return token;
  }

  async rotate(token: string): Promise<RotatedRefreshToken> {
    const tokenHash = hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      userId: stored.userId,
      refreshToken: await this.issue(stored.userId),
    };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
