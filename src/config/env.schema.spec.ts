import { validateEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  DATABASE_URL_UNPOOLED: 'postgresql://user:password@localhost:5432/app',
  JWT_SECRET: 'test-secret',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    expect(validateEnv(validEnv)).toEqual({
      ...validEnv,
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TTL: '15m',
      REFRESH_TTL_DAYS: 7,
      REFRESH_REUSE_GRACE_SECONDS: 60,
      CORS_ORIGINS: [],
      THROTTLE_TTL_SECONDS: 60,
      THROTTLE_LIMIT: 100,
      AUTH_THROTTLE_LIMIT: 10,
      MAIL_DRIVER: 'console',
      MAIL_FROM: 'EV ChargeOps <noreply@evchargeops.com.br>',
      PUSH_DRIVER: 'console',
      EXPO_ACCESS_TOKEN: '',
      APP_URL: 'http://localhost:5173',
      GOOGLE_CLIENT_IDS: [],
      APPLE_CLIENT_IDS: [],
      GOOGLE_WEB_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      CHARGER_DRIVER: 'mock',
      SIMULATION_SPEED: 60,
      ML_URL: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PUBLISHABLE_KEY: '',
      PAYMENT_HOLD_ENERGY_KWH: 60,
      PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES: 15,
    });
  });

  it('accepts the expo push driver and rejects unknown ones', () => {
    expect(validateEnv({ ...validEnv, PUSH_DRIVER: 'expo' }).PUSH_DRIVER).toBe(
      'expo',
    );
    expect(() => validateEnv({ ...validEnv, PUSH_DRIVER: 'fcm' })).toThrow(
      /PUSH_DRIVER/,
    );
  });

  it('coerces the payment hold settings and rejects invalid ones', () => {
    const env = validateEnv({
      ...validEnv,
      PAYMENT_HOLD_ENERGY_KWH: '42.5',
      PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES: '30',
    });
    expect(env.PAYMENT_HOLD_ENERGY_KWH).toBe(42.5);
    expect(env.PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES).toBe(30);
    expect(() =>
      validateEnv({ ...validEnv, PAYMENT_HOLD_ENERGY_KWH: '0' }),
    ).toThrow(/PAYMENT_HOLD_ENERGY_KWH/);
    expect(() =>
      validateEnv({ ...validEnv, PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES: '0' }),
    ).toThrow(/PAYMENT_AUTHORIZATION_TIMEOUT_MINUTES/);
  });

  it('accepts an ML service URL without the trailing slash', () => {
    expect(
      validateEnv({ ...validEnv, ML_URL: 'https://ml.evchargeops.com.br/' })
        .ML_URL,
    ).toBe('https://ml.evchargeops.com.br');
    expect(() => validateEnv({ ...validEnv, ML_URL: 'not a url' })).toThrow(
      /ML_URL/,
    );
  });

  it('rejects a simulation speed below real time', () => {
    expect(() => validateEnv({ ...validEnv, SIMULATION_SPEED: '0' })).toThrow(
      /SIMULATION_SPEED/,
    );
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a negative refresh reuse grace window', () => {
    expect(() =>
      validateEnv({ ...validEnv, REFRESH_REUSE_GRACE_SECONDS: '-1' }),
    ).toThrow(/REFRESH_REUSE_GRACE_SECONDS/);
  });

  it('coerces REFRESH_TTL_DAYS to a number', () => {
    expect(
      validateEnv({ ...validEnv, REFRESH_TTL_DAYS: '30' }).REFRESH_TTL_DAYS,
    ).toBe(30);
  });

  it('splits CORS_ORIGINS into a trimmed list', () => {
    expect(
      validateEnv({
        ...validEnv,
        CORS_ORIGINS: 'http://localhost:5173, https://app-*.vercel.app,',
      }).CORS_ORIGINS,
    ).toEqual(['http://localhost:5173', 'https://app-*.vercel.app']);
  });

  it('splits OAuth client ids into trimmed lists', () => {
    const env = validateEnv({
      ...validEnv,
      GOOGLE_CLIENT_IDS:
        'web.apps.googleusercontent.com, ios.apps.googleusercontent.com',
      APPLE_CLIENT_IDS: 'io.softmoon.evchargeops,io.softmoon.evchargeops.web,',
    });
    expect(env.GOOGLE_CLIENT_IDS).toEqual([
      'web.apps.googleusercontent.com',
      'ios.apps.googleusercontent.com',
    ]);
    expect(env.APPLE_CLIENT_IDS).toEqual([
      'io.softmoon.evchargeops',
      'io.softmoon.evchargeops.web',
    ]);
  });

  it('trims the Google authorization code flow settings', () => {
    const env = validateEnv({
      ...validEnv,
      GOOGLE_WEB_CLIENT_ID: ' web.apps.googleusercontent.com ',
      GOOGLE_CLIENT_SECRET: ' secret ',
    });
    expect(env.GOOGLE_WEB_CLIENT_ID).toBe('web.apps.googleusercontent.com');
    expect(env.GOOGLE_CLIENT_SECRET).toBe('secret');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL_UNPOOLED: validEnv.DATABASE_URL_UNPOOLED,
        JWT_SECRET: validEnv.JWT_SECRET,
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT_SECRET is missing', () => {
    const { JWT_SECRET: _omitted, ...env } = validEnv;
    expect(() => validateEnv(env)).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_ACCESS_TTL is not a duration', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_TTL: 'fifteen minutes' }),
    ).toThrow(/JWT_ACCESS_TTL/);
  });

  it('throws when NODE_ENV is not supported', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('requires RESEND_API_KEY only when MAIL_DRIVER is resend', () => {
    expect(() => validateEnv({ ...validEnv, MAIL_DRIVER: 'resend' })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() =>
      validateEnv({ ...validEnv, MAIL_DRIVER: 'resend', RESEND_API_KEY: ' ' }),
    ).toThrow(/RESEND_API_KEY/);
    expect(
      validateEnv({
        ...validEnv,
        MAIL_DRIVER: 'resend',
        RESEND_API_KEY: 're_test_key',
      }).RESEND_API_KEY,
    ).toBe('re_test_key');
    expect(validateEnv({ ...validEnv, RESEND_API_KEY: '' }).MAIL_DRIVER).toBe(
      'console',
    );
  });

  it('throws when MAIL_DRIVER is not supported', () => {
    expect(() => validateEnv({ ...validEnv, MAIL_DRIVER: 'smtp' })).toThrow(
      /MAIL_DRIVER/,
    );
  });

  it('removes trailing slashes from APP_URL', () => {
    expect(
      validateEnv({ ...validEnv, APP_URL: 'https://app.evchargeops.com.br/' })
        .APP_URL,
    ).toBe('https://app.evchargeops.com.br');
  });

  it('coerces rate limit settings and proxy trust', () => {
    const env = validateEnv({
      ...validEnv,
      THROTTLE_TTL_SECONDS: '30',
      THROTTLE_LIMIT: '50',
      AUTH_THROTTLE_LIMIT: '5',
      TRUST_PROXY: 'true',
    });
    expect(env).toMatchObject({
      THROTTLE_TTL_SECONDS: 30,
      THROTTLE_LIMIT: 50,
      AUTH_THROTTLE_LIMIT: 5,
      TRUST_PROXY: true,
    });
    expect(() =>
      validateEnv({ ...validEnv, AUTH_THROTTLE_LIMIT: '0' }),
    ).toThrow(/AUTH_THROTTLE_LIMIT/);
  });
});
