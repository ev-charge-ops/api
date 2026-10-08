import 'dotenv/config';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaAdapter } from '../src/database/prisma-adapter.factory.js';
import { DEFAULT_MEDIA_BASE_URL } from './demo-media.js';
import { DEFAULT_OCM_API_URL, OcmClient } from './ocm-client.js';
import { buildOcmNetwork, countByUf, writeOcmNetwork } from './ocm-network.js';

const importEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OCM_API_KEY: z.string().trim().min(1),
  OCM_API_URL: z.url().default(DEFAULT_OCM_API_URL),
  OCM_MAX_RESULTS: z.coerce.number().int().min(10).max(10_000).default(5000),
  MEDIA_BASE_URL: z
    .url()
    .default(DEFAULT_MEDIA_BASE_URL)
    .transform((url) => url.replace(/\/+$/, '')),
});

async function main(): Promise<void> {
  const parsed = importEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid import environment variables:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;
  const started = Date.now();
  const client = new OcmClient({
    apiKey: env.OCM_API_KEY,
    baseUrl: env.OCM_API_URL,
    maxResults: env.OCM_MAX_RESULTS,
    log: (message) => console.log(message),
  });
  const pois = await client.fetchBrazil();
  const network = buildOcmNetwork(pois, env.MEDIA_BASE_URL);
  console.log(
    `Mapped ${network.points.length} of ${pois.length} POIs to ${network.operators.length} operators`,
  );

  const prisma = new PrismaClient({
    adapter: createPrismaAdapter(env.DATABASE_URL),
  });
  try {
    const result = await writeOcmNetwork(prisma, network);
    console.log(
      `Imported ${result.operators} operators, created ${result.created} charge points and updated ${result.updated} in ${Math.round((Date.now() - started) / 1000)} s`,
    );
    for (const count of countByUf(network.points)) {
      console.log(
        `${count.uf}: ${count.total} charge points (${count.online} online)`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
