import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyEmailLoginDto } from './verify-email-login.dto.js';

async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(VerifyEmailLoginDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property).sort();
}

describe('VerifyEmailLoginDto', () => {
  it('accepts email with code', async () => {
    await expect(
      errorsFor({ email: 'Ana@Example.com', code: '042817' }),
    ).resolves.toEqual([]);
  });

  it('accepts a token alone', async () => {
    await expect(errorsFor({ token: 'magic-token' })).resolves.toEqual([]);
  });

  it('normalizes the email', () => {
    const dto = plainToInstance(VerifyEmailLoginDto, {
      email: ' Ana@Example.com ',
      code: '042817',
    });
    expect(dto.email).toBe('ana@example.com');
  });

  it('rejects an empty payload', async () => {
    await expect(errorsFor({})).resolves.toEqual(['code', 'email', 'token']);
  });

  it('rejects mixing a token with email or code', async () => {
    await expect(
      errorsFor({ token: 'magic-token', email: 'ana@example.com' }),
    ).resolves.toEqual(['token']);
    await expect(
      errorsFor({
        token: 'magic-token',
        email: 'ana@example.com',
        code: '042817',
      }),
    ).resolves.toEqual(['token']);
  });

  it('rejects an incomplete code form', async () => {
    await expect(errorsFor({ email: 'ana@example.com' })).resolves.toEqual([
      'code',
    ]);
    await expect(errorsFor({ code: '042817' })).resolves.toEqual(['email']);
  });

  it('rejects malformed codes', async () => {
    for (const code of ['12345', '1234567', '12a456', 123456]) {
      await expect(
        errorsFor({ email: 'ana@example.com', code }),
      ).resolves.toEqual(['code']);
    }
  });
});
