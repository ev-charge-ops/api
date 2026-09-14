import { validateEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  DATABASE_URL_UNPOOLED: 'postgresql://user:password@localhost:5432/app',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    expect(validateEnv(validEnv)).toEqual({
      ...validEnv,
      NODE_ENV: 'development',
      PORT: 3000,
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({ DATABASE_URL_UNPOOLED: validEnv.DATABASE_URL_UNPOOLED }),
    ).toThrow(/DATABASE_URL/);
  });

  it('throws when NODE_ENV is not supported', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});
