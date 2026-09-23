import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaAdapter } from '../src/database/prisma-adapter.factory.js';
import { buildDemoSite, upsertDemoSite } from './demo-charge-points.js';
import {
  buildDemoHistory,
  buildDemoResidents,
  insertDemoHistory,
  upsertDemoResidents,
} from './demo-history.js';
import {
  buildDemoOrganization,
  upsertDemoOrganization,
} from './demo-organization.js';
import { buildDemoUsers, parseSeedEnv, upsertDemoUsers } from './demo-users.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const env = parseSeedEnv(process.env);
  const users = buildDemoUsers(env);
  const organization = buildDemoOrganization({
    managerEmail: env.SEED_MANAGER_EMAIL,
    driverEmail: env.SEED_DRIVER_EMAIL,
  });
  const prisma = new PrismaClient({
    adapter: createPrismaAdapter(connectionString),
  });
  try {
    await upsertDemoUsers(prisma, users);
    for (const user of users) {
      console.log(`Seeded ${user.role} ${user.email}`);
    }
    await upsertDemoOrganization(prisma, organization);
    console.log(`Seeded organization ${organization.name}`);
    const site = buildDemoSite(organization.id);
    await upsertDemoSite(prisma, site);
    console.log(`Seeded ${site.chargePoints.length} charge points and tariffs`);

    const residents = await upsertDemoResidents(
      prisma,
      organization.id,
      buildDemoResidents(),
    );
    const demoDriver = await prisma.user.findUniqueOrThrow({
      where: { email: env.SEED_DRIVER_EMAIL },
    });
    const history = buildDemoHistory({
      organizationId: organization.id,
      now: new Date(),
      points: site.chargePoints.map((point) => ({
        id: point.id,
        code: point.code,
        type: point.type,
        maxPowerKw: point.maxPowerKw,
        rateCents: point.tariff?.baseRateCents ?? site.tariff.utilityRateCents,
      })),
      drivers: [...residents, { userId: demoDriver.id, unitLabel: 'B · 42' }],
    });
    const inserted = await insertDemoHistory(prisma, history);
    console.log(
      `Seeded ${residents.length} residents and ${inserted} of ${history.length} historical sessions`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
