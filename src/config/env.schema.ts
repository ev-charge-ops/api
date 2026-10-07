import { z } from 'zod';

export const DEFAULT_MAIL_FROM = 'EV ChargeOps <noreply@evchargeops.com.br>';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url(),
    JWT_SECRET: z.string().min(1),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+(ms|s|m|h|d)$/, 'must be a duration such as 15m or 1h')
      .default('15m'),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    MAIL_DRIVER: z.enum(['console', 'resend']).default('console'),
    MAIL_FROM: z.string().min(1).default(DEFAULT_MAIL_FROM),
    RESEND_API_KEY: z.string().trim().optional(),
    APP_URL: z
      .url()
      .default('http://localhost:5173')
      .transform((value) => value.replace(/\/+$/, '')),
  })
  .superRefine((env, context) => {
    if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'is required when MAIL_DRIVER is resend',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
