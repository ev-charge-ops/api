import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { OneTimeTokenType } from '../../generated/prisma/enums.js';
import { hashToken } from './refresh-token.service.js';

const TOKEN_BYTES = 32;
const CODE_LENGTH = 6;
const CODE_UPPER_BOUND = 10 ** CODE_LENGTH;
const MINUTE_IN_MS = 60 * 1000;

export const MAX_CODE_ATTEMPTS = 5;

export interface IssueOneTimeTokenOptions {
  withCode?: boolean;
}

export interface IssuedOneTimeToken {
  token: string;
  code?: string;
  expiresAt: Date;
}

export interface ConsumedOneTimeToken {
  id: string;
  userId: string;
}

@Injectable()
export class OneTimeTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    type: OneTimeTokenType,
    ttlMinutes: number,
    options: IssueOneTimeTokenOptions = {},
  ): Promise<IssuedOneTimeToken> {
    const id = randomUUID();
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const code = options.withCode ? generateCode() : undefined;
    const expiresAt = new Date(Date.now() + ttlMinutes * MINUTE_IN_MS);

    await this.prisma.$transaction([
      this.prisma.oneTimeToken.deleteMany({
        where: { userId, type, consumedAt: null },
      }),
      this.prisma.oneTimeToken.create({
        data: {
          id,
          userId,
          type,
          tokenHash: hashToken(token),
          codeHash: code === undefined ? null : hashCode(id, code),
          expiresAt,
        },
      }),
    ]);

    return { token, code, expiresAt };
  }

  async consumeByToken(
    type: OneTimeTokenType,
    rawToken: string,
  ): Promise<ConsumedOneTimeToken | null> {
    const stored = await this.prisma.oneTimeToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!stored || stored.type !== type) {
      return null;
    }
    return this.markConsumed(stored, { lt: MAX_CODE_ATTEMPTS });
  }

  async consumeByCode(
    type: OneTimeTokenType,
    userId: string,
    code: string,
  ): Promise<ConsumedOneTimeToken | null> {
    const stored = await this.prisma.oneTimeToken.findFirst({
      where: {
        userId,
        type,
        consumedAt: null,
        codeHash: { not: null },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!stored?.codeHash) {
      return null;
    }

    const { count } = await this.prisma.oneTimeToken.updateMany({
      where: {
        id: stored.id,
        consumedAt: null,
        attempts: { lt: MAX_CODE_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (count === 0 || !safeEqual(stored.codeHash, hashCode(stored.id, code))) {
      return null;
    }
    return this.markConsumed(stored, { lte: MAX_CODE_ATTEMPTS });
  }

  private async markConsumed(
    stored: ConsumedOneTimeToken,
    attempts: { lt: number } | { lte: number },
  ): Promise<ConsumedOneTimeToken | null> {
    const { count } = await this.prisma.oneTimeToken.updateMany({
      where: {
        id: stored.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts,
      },
      data: { consumedAt: new Date() },
    });
    return count === 1 ? { id: stored.id, userId: stored.userId } : null;
  }
}

function generateCode(): string {
  return randomInt(0, CODE_UPPER_BOUND).toString().padStart(CODE_LENGTH, '0');
}

function hashCode(tokenId: string, code: string): string {
  return createHash('sha256').update(`${tokenId}:${code}`).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
