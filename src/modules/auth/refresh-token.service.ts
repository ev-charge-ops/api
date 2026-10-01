import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RefreshToken } from '../../generated/prisma/client.js';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';

const TOKEN_BYTES = 32;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SECOND_IN_MS = 1000;
const MAX_SUCCESSOR_HOPS = 10;

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
    const { token } = await this.create(userId);
    return token;
  }

  async rotate(token: string): Promise<RotatedRefreshToken> {
    const tokenHash = hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.expiresAt <= new Date()) {
      throw invalidRefreshToken();
    }

    if (!stored.revokedAt) {
      const successor = await this.create(stored.userId);
      const now = new Date();
      const { count } = await this.prisma.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now, rotatedAt: now, replacedById: successor.id },
      });
      if (count === 1) {
        return { userId: stored.userId, refreshToken: successor.token };
      }
      await this.prisma.refreshToken.delete({ where: { id: successor.id } });
    }

    return this.rotateWithinGrace(stored.id);
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

  private async rotateWithinGrace(
    tokenId: string,
  ): Promise<RotatedRefreshToken> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });
    if (
      !stored ||
      !this.isWithinGrace(stored) ||
      !(await this.isSessionAlive(stored))
    ) {
      throw invalidRefreshToken();
    }
    return {
      userId: stored.userId,
      refreshToken: await this.issue(stored.userId),
    };
  }

  private isWithinGrace(token: RefreshToken): boolean {
    if (!token.rotatedAt || token.expiresAt <= new Date()) {
      return false;
    }
    const graceMs =
      this.config.get('REFRESH_REUSE_GRACE_SECONDS', { infer: true }) *
      SECOND_IN_MS;
    return Date.now() - token.rotatedAt.getTime() < graceMs;
  }

  private async isSessionAlive(token: RefreshToken): Promise<boolean> {
    let current = token;
    for (let hop = 0; hop < MAX_SUCCESSOR_HOPS; hop++) {
      if (!current.replacedById) {
        return false;
      }
      const successor = await this.prisma.refreshToken.findUnique({
        where: { id: current.replacedById },
      });
      if (!successor || successor.expiresAt <= new Date()) {
        return false;
      }
      if (!successor.revokedAt) {
        return true;
      }
      if (!successor.rotatedAt) {
        return false;
      }
      current = successor;
    }
    return false;
  }

  private async create(userId: string): Promise<{ id: string; token: string }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const { id } = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlDays * DAY_IN_MS),
      },
      select: { id: true },
    });
    return { id, token };
  }
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException('Invalid refresh token');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
