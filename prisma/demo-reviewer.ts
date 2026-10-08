import { hash } from '@node-rs/argon2';
import { z } from 'zod';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { MembershipRole } from '../src/generated/prisma/enums.js';

export const DEFAULT_REVIEWER_EMAIL = 'appreview@evchargeops.com.br';

const emptyAsUnset = (value: unknown) => (value === '' ? undefined : value);

const reviewerEnvSchema = z.object({
  SEED_REVIEWER_EMAIL: z.preprocess(
    emptyAsUnset,
    z
      .email()
      .default(DEFAULT_REVIEWER_EMAIL)
      .transform((email) => email.toLowerCase()),
  ),
  SEED_REVIEWER_PASSWORD: z.preprocess(
    emptyAsUnset,
    z.string().min(8).optional(),
  ),
});

export type ReviewerEnv = z.infer<typeof reviewerEnvSchema>;

export interface DemoReviewer {
  name: string;
  email: string;
  password: string;
  membership: { role: MembershipRole; unitLabel: string };
}

export function parseReviewerEnv(env: Record<string, unknown>): ReviewerEnv {
  const result = reviewerEnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(
      `Invalid seed environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function buildDemoReviewer(env: ReviewerEnv): DemoReviewer | null {
  if (!env.SEED_REVIEWER_PASSWORD) {
    return null;
  }
  return {
    name: 'Revisor App Store',
    email: env.SEED_REVIEWER_EMAIL,
    password: env.SEED_REVIEWER_PASSWORD,
    membership: { role: 'DRIVER', unitLabel: 'Revisão · 01' },
  };
}

export async function upsertDemoReviewer(
  prisma: Pick<PrismaClient, 'user' | 'membership'>,
  reviewer: DemoReviewer,
  organizationId: string,
): Promise<void> {
  const data = {
    name: reviewer.name,
    role: 'DRIVER' as const,
    passwordHash: await hash(reviewer.password),
    paymentMode: 'LIVE' as const,
    locationMode: 'DEVICE' as const,
    autoRefund: true,
  };
  const user = await prisma.user.upsert({
    where: { email: reviewer.email },
    update: data,
    create: { ...data, email: reviewer.email, emailVerifiedAt: new Date() },
  });
  await prisma.user.updateMany({
    where: { id: user.id, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId } },
    update: reviewer.membership,
    create: { ...reviewer.membership, userId: user.id, organizationId },
  });
}
