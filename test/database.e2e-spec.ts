import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';

describe('Database (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('runs a query against the database', async () => {
    const prisma = app.get(PrismaService);

    const rows = await prisma.$queryRaw<
      { result: number }[]
    >`SELECT 1 AS result`;

    expect(rows).toEqual([{ result: 1 }]);
  });

  afterAll(async () => {
    await app.close();
  });
});
