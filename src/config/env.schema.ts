import { z } from 'zod';

export const DEFAULT_MAIL_FROM = 'EV ChargeOps <noreply@evchargeops.com.br>';

const commaSeparatedList = () =>
  z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );

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
    REFRESH_REUSE_GRACE_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .max(600)
      .default(60),
    CORS_ORIGINS: commaSeparatedList(),
    THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
    TRUST_PROXY: z.stringbool().optional(),
    VERCEL: z.string().optional(),
    MAIL_DRIVER: z.enum(['console', 'resend']).default('console'),
    MAIL_FROM: z.string().min(1).default(DEFAULT_MAIL_FROM),
    RESEND_API_KEY: z.string().trim().optional(),
    PUSH_DRIVER: z.enum(['console', 'expo']).default('console'),
    EXPO_ACCESS_TOKEN: z.string().trim().default(''),
    APP_URL: z
      .url()
      .default('http://localhost:5173')
      .transform((value) => value.replace(/\/+$/, '')),
    GOOGLE_CLIENT_IDS: commaSeparatedList(),
    APPLE_CLIENT_IDS: commaSeparatedList(),
    GOOGLE_WEB_CLIENT_ID: z.string().trim().default(''),
    GOOGLE_CLIENT_SECRET: z.string().trim().default(''),
    CHARGER_DRIVER: z.enum(['mock', 'sems']).default('mock'),
    SIMULATION_SPEED: z.coerce.number().int().min(1).max(3600).default(60),
    ML_URL: z
      .union([z.literal(''), z.url()])
      .default('')
      .transform((value) => value.replace(/\/+$/, '')),
    STRIPE_SECRET_KEY: z.string().trim().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().trim().default(''),
    STRIPE_PUBLISHABLE_KEY: z.string().trim().default(''),
    STRIPE_LIVE_SECRET_KEY: z.string().trim().default(''),
    STRIPE_LIVE_WEBHOOK_SECRET: z.string().trim().default(''),
    STRIPE_LIVE_PUBLISHABLE_KEY: z.string().trim().default(''),
    PAYMENT_HOLD_ENERGY_KWH: z.coerce.number().positive().max(500).default(60),
    PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(15),
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
