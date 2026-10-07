import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPrismaAdapter } from './prisma-adapter.factory.js';

describe('createPrismaAdapter', () => {
  it('uses the Neon serverless adapter for Neon hosts', () => {
    const adapter = createPrismaAdapter(
      'postgresql://user:password@ep-example-pooler.sa-east-1.aws.neon.tech/app?sslmode=require',
    );
    expect(adapter).toBeInstanceOf(PrismaNeon);
  });

  it('uses the node-postgres adapter for other hosts', () => {
    const adapter = createPrismaAdapter(
      'postgresql://postgres:postgres@localhost:5432/app',
    );
    expect(adapter).toBeInstanceOf(PrismaPg);
  });
});
