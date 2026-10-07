import { verify } from '@node-rs/argon2';
import { buildDemoUsers, parseSeedEnv, upsertDemoUsers } from './demo-users.js';

const passwords = {
  SEED_MANAGER_PASSWORD: 'manager-pass',
  SEED_DRIVER_PASSWORD: 'driver-pass',
};

describe('parseSeedEnv', () => {
  it('applies default demo emails', () => {
    expect(parseSeedEnv(passwords)).toEqual({
      ...passwords,
      SEED_MANAGER_EMAIL: 'manager@evchargeops.dev',
      SEED_DRIVER_EMAIL: 'driver@evchargeops.dev',
    });
  });

  it('normalizes custom emails to lowercase', () => {
    const env = parseSeedEnv({
      ...passwords,
      SEED_MANAGER_EMAIL: 'Boss@Example.com',
    });
    expect(env.SEED_MANAGER_EMAIL).toBe('boss@example.com');
  });

  it('requires both passwords', () => {
    expect(() => parseSeedEnv({ SEED_DRIVER_PASSWORD: 'driver-pass' })).toThrow(
      /SEED_MANAGER_PASSWORD/,
    );
    expect(() =>
      parseSeedEnv({ SEED_MANAGER_PASSWORD: 'manager-pass' }),
    ).toThrow(/SEED_DRIVER_PASSWORD/);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(() =>
      parseSeedEnv({ ...passwords, SEED_DRIVER_PASSWORD: 'short' }),
    ).toThrow(/SEED_DRIVER_PASSWORD/);
  });
});

describe('upsertDemoUsers', () => {
  it('upserts a manager and a driver keyed by email with hashed passwords', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const users = buildDemoUsers(parseSeedEnv(passwords));

    await upsertDemoUsers({ user: { upsert } } as never, users);

    expect(upsert).toHaveBeenCalledTimes(2);
    const [managerCall, driverCall] = upsert.mock.calls.map(([args]) => args);
    expect(managerCall.where).toEqual({ email: 'manager@evchargeops.dev' });
    expect(managerCall.create.role).toBe('MANAGER');
    expect(driverCall.where).toEqual({ email: 'driver@evchargeops.dev' });
    expect(driverCall.create.role).toBe('DRIVER');
    expect(await verify(managerCall.update.passwordHash, 'manager-pass')).toBe(
      true,
    );
    expect(driverCall.create.passwordHash).not.toContain('driver-pass');
  });
});
