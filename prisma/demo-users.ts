import { hash } from '@node-rs/argon2';
import { z } from 'zod';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { Role } from '../src/generated/prisma/enums.js';
import { DEFAULT_MEDIA_BASE_URL } from './demo-media.js';

const seedEnvSchema = z.object({
  SEED_MANAGER_EMAIL: z
    .email()
    .default('manager@evchargeops.dev')
    .transform((email) => email.toLowerCase()),
  SEED_MANAGER_PASSWORD: z.string().min(8),
  SEED_DRIVER_EMAIL: z
    .email()
    .default('driver@evchargeops.dev')
    .transform((email) => email.toLowerCase()),
  SEED_DRIVER_PASSWORD: z.string().min(8),
  MEDIA_BASE_URL: z
    .url()
    .default(DEFAULT_MEDIA_BASE_URL)
    .transform((url) => url.replace(/\/+$/, '')),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;

export interface DemoUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export function parseSeedEnv(env: Record<string, unknown>): SeedEnv {
  const result = seedEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid seed environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function buildDemoUsers(env: SeedEnv): DemoUser[] {
  return [
    {
      name: 'Gestor Demo',
      email: env.SEED_MANAGER_EMAIL,
      password: env.SEED_MANAGER_PASSWORD,
      role: Role.MANAGER,
    },
    {
      name: 'Motorista Demo',
      email: env.SEED_DRIVER_EMAIL,
      password: env.SEED_DRIVER_PASSWORD,
      role: Role.DRIVER,
    },
  ];
}

export async function upsertDemoUsers(
  prisma: Pick<PrismaClient, 'user'>,
  users: DemoUser[],
): Promise<void> {
  for (const user of users) {
    const data = {
      name: user.name,
      role: user.role,
      passwordHash: await hash(user.password),
    };
    await prisma.user.upsert({
      where: { email: user.email },
      update: data,
      create: { ...data, email: user.email, emailVerifiedAt: new Date() },
    });
  }
}
