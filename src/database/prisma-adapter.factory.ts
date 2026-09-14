import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaPg } from '@prisma/adapter-pg';

const NEON_HOST_SUFFIX = '.neon.tech';

export function createPrismaAdapter(
  connectionString: string,
): PrismaNeon | PrismaPg {
  const { hostname } = new URL(connectionString);
  if (hostname.endsWith(NEON_HOST_SUFFIX)) {
    return new PrismaNeon({ connectionString });
  }
  return new PrismaPg({ connectionString });
}
