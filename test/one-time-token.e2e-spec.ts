import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import {
  MAX_CODE_ATTEMPTS,
  OneTimeTokenService,
} from './../src/modules/auth/one-time-token.service.js';

describe('OneTimeTokenService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: OneTimeTokenService;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(OneTimeTokenService);
    const user = await prisma.user.create({
      data: {
        name: 'Token Owner',
        email: `tokens-${randomUUID()}@example.com`,
        passwordHash: 'not-a-real-hash',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('issues, invalidates and consumes tokens against the database', async () => {
    const first = await tokens.issue(userId, 'PASSWORD_RESET', 30);
    const second = await tokens.issue(userId, 'PASSWORD_RESET', 30);

    await expect(
      tokens.consumeByToken('PASSWORD_RESET', first.token),
    ).resolves.toBeNull();
    await expect(
      tokens.consumeByToken('PASSWORD_RESET', second.token),
    ).resolves.toMatchObject({ userId });
    await expect(
      tokens.consumeByToken('PASSWORD_RESET', second.token),
    ).resolves.toBeNull();
  });

  it('locks a code after too many wrong attempts', async () => {
    const issued = await tokens.issue(userId, 'EMAIL_LOGIN', 10, {
      withCode: true,
    });
    const wrongCode = issued.code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      await expect(
        tokens.consumeByCode('EMAIL_LOGIN', userId, wrongCode),
      ).resolves.toBeNull();
    }

    await expect(
      tokens.consumeByCode('EMAIL_LOGIN', userId, issued.code!),
    ).resolves.toBeNull();
    await expect(
      tokens.consumeByToken('EMAIL_LOGIN', issued.token),
    ).resolves.toBeNull();
  });

  it('consumes a code once', async () => {
    const issued = await tokens.issue(userId, 'EMAIL_LOGIN', 10, {
      withCode: true,
    });

    await expect(
      tokens.consumeByCode('EMAIL_LOGIN', userId, issued.code!),
    ).resolves.toMatchObject({ userId });
    await expect(
      tokens.consumeByCode('EMAIL_LOGIN', userId, issued.code!),
    ).resolves.toBeNull();
  });
});
