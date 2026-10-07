import { verify } from '@node-rs/argon2';
import {
  buildDemoReviewer,
  parseReviewerEnv,
  upsertDemoReviewer,
} from './demo-reviewer.js';

describe('parseReviewerEnv', () => {
  it('applies the default App Review email', () => {
    expect(parseReviewerEnv({})).toEqual({
      SEED_REVIEWER_EMAIL: 'appreview@evchargeops.com.br',
    });
    expect(
      parseReviewerEnv({ SEED_REVIEWER_EMAIL: '', SEED_REVIEWER_PASSWORD: '' }),
    ).toEqual({ SEED_REVIEWER_EMAIL: 'appreview@evchargeops.com.br' });
  });

  it('normalizes a custom email to lowercase', () => {
    expect(
      parseReviewerEnv({
        SEED_REVIEWER_EMAIL: 'Review@Example.com',
        SEED_REVIEWER_PASSWORD: 'review-pass',
      }),
    ).toEqual({
      SEED_REVIEWER_EMAIL: 'review@example.com',
      SEED_REVIEWER_PASSWORD: 'review-pass',
    });
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(() => parseReviewerEnv({ SEED_REVIEWER_PASSWORD: 'short' })).toThrow(
      /SEED_REVIEWER_PASSWORD/,
    );
  });
});

describe('buildDemoReviewer', () => {
  it('skips the account without a password', () => {
    expect(buildDemoReviewer(parseReviewerEnv({}))).toBeNull();
  });

  it('builds the App Review driver of the demo condo', () => {
    expect(
      buildDemoReviewer(
        parseReviewerEnv({ SEED_REVIEWER_PASSWORD: 'review-pass' }),
      ),
    ).toEqual({
      name: 'Revisor App Store',
      email: 'appreview@evchargeops.com.br',
      password: 'review-pass',
      membership: { role: 'DRIVER', unitLabel: 'Revisão · 01' },
    });
  });
});

describe('upsertDemoReviewer', () => {
  it('upserts the reviewer with live payments, device location and auto refund', async () => {
    const userUpsert = vi.fn().mockResolvedValue({ id: 'reviewer-id' });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const membershipUpsert = vi.fn().mockResolvedValue({});
    const reviewer = buildDemoReviewer(
      parseReviewerEnv({ SEED_REVIEWER_PASSWORD: 'review-pass' }),
    );

    await upsertDemoReviewer(
      {
        user: { upsert: userUpsert, updateMany },
        membership: { upsert: membershipUpsert },
      } as never,
      reviewer!,
      'org-id',
    );

    const [userCall] = userUpsert.mock.calls.map(([args]) => args);
    expect(userCall.where).toEqual({ email: 'appreview@evchargeops.com.br' });
    expect(userCall.update).toMatchObject({
      name: 'Revisor App Store',
      role: 'DRIVER',
      paymentMode: 'LIVE',
      locationMode: 'DEVICE',
      autoRefund: true,
    });
    expect(userCall.create).toMatchObject({
      email: 'appreview@evchargeops.com.br',
      paymentMode: 'LIVE',
      locationMode: 'DEVICE',
      autoRefund: true,
      emailVerifiedAt: expect.any(Date),
    });
    expect(await verify(userCall.update.passwordHash, 'review-pass')).toBe(
      true,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'reviewer-id', emailVerifiedAt: null },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(membershipUpsert).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: 'reviewer-id',
          organizationId: 'org-id',
        },
      },
      update: { role: 'DRIVER', unitLabel: 'Revisão · 01' },
      create: {
        role: 'DRIVER',
        unitLabel: 'Revisão · 01',
        userId: 'reviewer-id',
        organizationId: 'org-id',
      },
    });
  });
});
