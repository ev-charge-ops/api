import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaAdapter } from '../src/database/prisma-adapter.factory.js';
import { MlAnomalyScorer } from '../src/modules/intelligence/anomaly/ml-anomaly-scorer.js';
import { MlHttpClient } from '../src/modules/intelligence/ml/ml-http-client.js';
import {
  buildDemoAnomalies,
  FallbackAnomalyScorer,
  findOccupiedIntervals,
  insertDemoAnomalies,
  RuleAnomalyScorer,
} from './demo-anomalies.js';
import { buildDemoSite, upsertDemoSite } from './demo-charge-points.js';
import {
  buildDemoCommercialNetwork,
  buildDemoNetworkHistory,
  upsertDemoCommercialNetwork,
} from './demo-commercial-network.js';
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

const DEFAULT_ML_URL = 'https://ml.evchargeops.com.br';
const SEED_ML_TIMEOUT_MS = 10_000;

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
    const site = buildDemoSite(organization.id, env.MEDIA_BASE_URL);
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
    const now = new Date();
    const points = site.chargePoints.map((point) => ({
      id: point.id,
      code: point.code,
      type: point.type,
      maxPowerKw: point.maxPowerKw,
      rateCents: point.tariff?.baseRateCents ?? site.tariff.utilityRateCents,
    }));
    const drivers = [
      ...residents,
      { userId: demoDriver.id, unitLabel: 'B · 42' },
    ];
    const history = buildDemoHistory({
      organizationId: organization.id,
      now,
      points,
      drivers,
    });
    const inserted = await insertDemoHistory(prisma, history);
    console.log(
      `Seeded ${residents.length} residents and ${inserted} of ${history.length} historical sessions`,
    );

    const anomalies = buildDemoAnomalies({
      organizationId: organization.id,
      now,
      points,
      drivers,
      occupied: await findOccupiedIntervals(
        prisma,
        points.map((point) => point.id),
        now,
      ),
    });
    const mlUrl = process.env.ML_URL || DEFAULT_ML_URL;
    const scorer = new FallbackAnomalyScorer(
      new MlAnomalyScorer(
        new MlHttpClient({ baseUrl: mlUrl, timeoutMs: SEED_ML_TIMEOUT_MS }),
      ),
      new RuleAnomalyScorer(),
    );
    const insertedAnomalies = await insertDemoAnomalies(
      prisma,
      anomalies,
      scorer,
    );
    console.log(
      `Seeded ${insertedAnomalies} of ${anomalies.length} anomalous sessions scored by ${mlUrl} with the rule fallback`,
    );

    const network = buildDemoCommercialNetwork(env.MEDIA_BASE_URL);
    await upsertDemoCommercialNetwork(prisma, network);
    const networkHistory = buildDemoNetworkHistory({
      now,
      operators: network,
      drivers,
    });
    const insertedNetworkHistory = await insertDemoHistory(
      prisma,
      networkHistory,
    );
    console.log(
      `Seeded ${network.length} commercial operators with ${network.flatMap((operator) => operator.chargePoints).length} charge points and ${insertedNetworkHistory} of ${networkHistory.length} historical sessions`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
