import type { PrismaService } from '../../database/prisma.service.js';
import type { OneTimeToken } from '../../generated/prisma/client.js';
import type { OneTimeTokenType } from '../../generated/prisma/enums.js';
import {
  MAX_CODE_ATTEMPTS,
  OneTimeTokenService,
} from './one-time-token.service.js';
import { hashToken } from './refresh-token.service.js';

type NumberFilter = { lt?: number; lte?: number };
type TokenWhere = {
  id?: string;
  userId?: string;
  type?: OneTimeTokenType;
  consumedAt?: null;
  codeHash?: { not: null };
  expiresAt?: { gt: Date };
  attempts?: NumberFilter;
};

function matches(token: OneTimeToken, where: TokenWhere): boolean {
  return (
    (where.id === undefined || token.id === where.id) &&
    (where.userId === undefined || token.userId === where.userId) &&
    (where.type === undefined || token.type === where.type) &&
    (where.consumedAt === undefined || token.consumedAt === null) &&
    (where.codeHash === undefined || token.codeHash !== null) &&
    (where.expiresAt === undefined || token.expiresAt > where.expiresAt.gt) &&
    (where.attempts?.lt === undefined || token.attempts < where.attempts.lt) &&
    (where.attempts?.lte === undefined || token.attempts <= where.attempts.lte)
  );
}

function createInMemoryPrisma() {
  let tokens: OneTimeToken[] = [];

  return {
    get tokens() {
      return tokens;
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    oneTimeToken: {
      deleteMany: ({ where }: { where: TokenWhere }) => {
        const before = tokens.length;
        tokens = tokens.filter((token) => !matches(token, where));
        return Promise.resolve({ count: before - tokens.length });
      },
      create: ({
        data,
      }: {
        data: Omit<
          OneTimeToken,
          'consumedAt' | 'attempts' | 'createdAt' | 'codeHash'
        > & { codeHash: string | null };
      }) => {
        const token: OneTimeToken = {
          consumedAt: null,
          attempts: 0,
          createdAt: new Date(),
          ...data,
        };
        tokens.push(token);
        return Promise.resolve(token);
      },
      findUnique: ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          tokens.find((token) => token.tokenHash === where.tokenHash) ?? null,
        ),
      findFirst: ({ where }: { where: TokenWhere }) =>
        Promise.resolve(
          tokens.findLast((token) => matches(token, where)) ?? null,
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: TokenWhere;
        data: { consumedAt?: Date; attempts?: { increment: number } };
      }) => {
        const matching = tokens.filter((token) => matches(token, where));
        for (const token of matching) {
          if (data.consumedAt) {
            token.consumedAt = data.consumedAt;
          }
          if (data.attempts) {
            token.attempts += data.attempts.increment;
          }
        }
        return Promise.resolve({ count: matching.length });
      },
    },
  };
}

describe('OneTimeTokenService', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let service: OneTimeTokenService;

  beforeEach(() => {
    prisma = createInMemoryPrisma();
    service = new OneTimeTokenService(prisma as unknown as PrismaService);
  });

  describe('issue', () => {
    it('returns an opaque token and stores only its hash', async () => {
      const issued = await service.issue('user-1', 'EMAIL_VERIFICATION', 60);

      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(issued.code).toBeUndefined();
      const [stored] = prisma.tokens;
      expect(stored.tokenHash).toBe(hashToken(issued.token));
      expect(stored.codeHash).toBeNull();
      expect(stored.type).toBe('EMAIL_VERIFICATION');
      const ttlMs = stored.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(59 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000);
    });

    it('optionally returns a six digit code stored as a hash', async () => {
      const issued = await service.issue('user-1', 'EMAIL_LOGIN', 10, {
        withCode: true,
      });

      expect(issued.code).toMatch(/^\d{6}$/);
      const [stored] = prisma.tokens;
      expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.codeHash).not.toContain(issued.code);
    });

    it('invalidates previous unconsumed tokens of the same type only', async () => {
      const first = await service.issue('user-1', 'PASSWORD_RESET', 30);
      const other = await service.issue('user-1', 'EMAIL_VERIFICATION', 30);
      const second = await service.issue('user-1', 'PASSWORD_RESET', 30);

      await expect(
        service.consumeByToken('PASSWORD_RESET', first.token),
      ).resolves.toBeNull();
      await expect(
        service.consumeByToken('PASSWORD_RESET', second.token),
      ).resolves.toMatchObject({ userId: 'user-1' });
      await expect(
        service.consumeByToken('EMAIL_VERIFICATION', other.token),
      ).resolves.toMatchObject({ userId: 'user-1' });
    });
  });

  describe('consumeByToken', () => {
    it('consumes a token only once', async () => {
      const issued = await service.issue('user-1', 'PASSWORD_RESET', 30);

      await expect(
        service.consumeByToken('PASSWORD_RESET', issued.token),
      ).resolves.toEqual({ id: prisma.tokens[0].id, userId: 'user-1' });
      await expect(
        service.consumeByToken('PASSWORD_RESET', issued.token),
      ).resolves.toBeNull();
    });

    it('rejects a token of another type', async () => {
      const issued = await service.issue('user-1', 'PASSWORD_RESET', 30);

      await expect(
        service.consumeByToken('EMAIL_LOGIN', issued.token),
      ).resolves.toBeNull();
      expect(prisma.tokens[0].consumedAt).toBeNull();
    });

    it('rejects an expired token', async () => {
      const issued = await service.issue('user-1', 'PASSWORD_RESET', 30);
      prisma.tokens[0].expiresAt = new Date(Date.now() - 1000);

      await expect(
        service.consumeByToken('PASSWORD_RESET', issued.token),
      ).resolves.toBeNull();
    });

    it('rejects an unknown token', async () => {
      await expect(
        service.consumeByToken('PASSWORD_RESET', 'unknown'),
      ).resolves.toBeNull();
    });
  });

  describe('consumeByCode', () => {
    it('consumes the token with the right code', async () => {
      const issued = await service.issue('user-1', 'EMAIL_LOGIN', 10, {
        withCode: true,
      });

      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-1', issued.code!),
      ).resolves.toMatchObject({ userId: 'user-1' });
      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-1', issued.code!),
      ).resolves.toBeNull();
      await expect(
        service.consumeByToken('EMAIL_LOGIN', issued.token),
      ).resolves.toBeNull();
    });

    it('rejects a code belonging to another user', async () => {
      const issued = await service.issue('user-1', 'EMAIL_LOGIN', 10, {
        withCode: true,
      });

      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-2', issued.code!),
      ).resolves.toBeNull();
    });

    it('locks the token after too many wrong codes', async () => {
      const issued = await service.issue('user-1', 'EMAIL_LOGIN', 10, {
        withCode: true,
      });
      const wrongCode = issued.code === '000000' ? '111111' : '000000';

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        await expect(
          service.consumeByCode('EMAIL_LOGIN', 'user-1', wrongCode),
        ).resolves.toBeNull();
      }

      expect(prisma.tokens[0].attempts).toBe(MAX_CODE_ATTEMPTS);
      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-1', issued.code!),
      ).resolves.toBeNull();
      await expect(
        service.consumeByToken('EMAIL_LOGIN', issued.token),
      ).resolves.toBeNull();
      expect(prisma.tokens[0].attempts).toBe(MAX_CODE_ATTEMPTS);
    });

    it('accepts the right code on the last allowed attempt', async () => {
      const issued = await service.issue('user-1', 'EMAIL_LOGIN', 10, {
        withCode: true,
      });
      const wrongCode = issued.code === '000000' ? '111111' : '000000';

      for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        await service.consumeByCode('EMAIL_LOGIN', 'user-1', wrongCode);
      }

      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-1', issued.code!),
      ).resolves.toMatchObject({ userId: 'user-1' });
    });

    it('rejects an expired code', async () => {
      const issued = await service.issue('user-1', 'EMAIL_LOGIN', 10, {
        withCode: true,
      });
      prisma.tokens[0].expiresAt = new Date(Date.now() - 1000);

      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-1', issued.code!),
      ).resolves.toBeNull();
    });

    it('ignores tokens issued without a code', async () => {
      await service.issue('user-1', 'EMAIL_LOGIN', 10);

      await expect(
        service.consumeByCode('EMAIL_LOGIN', 'user-1', '123456'),
      ).resolves.toBeNull();
      expect(prisma.tokens[0].attempts).toBe(0);
    });
  });
});
