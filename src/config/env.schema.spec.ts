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
      CORS_ORIGINS: [],
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
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
});
