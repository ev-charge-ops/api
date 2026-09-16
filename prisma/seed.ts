import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaAdapter } from '../src/database/prisma-adapter.factory.js';
import { buildDemoUsers, parseSeedEnv, upsertDemoUsers } from './demo-users.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const users = buildDemoUsers(parseSeedEnv(process.env));
  const prisma = new PrismaClient({
    adapter: createPrismaAdapter(connectionString),
  });
  try {
    await upsertDemoUsers(prisma, users);
    for (const user of users) {
      console.log(`Seeded ${user.role} ${user.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
