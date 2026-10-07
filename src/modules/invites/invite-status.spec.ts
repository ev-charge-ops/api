import { HttpStatus } from '@nestjs/common';
import { inviteUnavailable } from './invite-errors.js';
import { inviteStatus } from './invite-status.js';

describe('inviteStatus', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const future = new Date('2026-10-14T12:00:00Z');
  const past = new Date('2026-10-07T11:59:59Z');

  it('is pending before the expiry', () => {
    expect(
      inviteStatus(
        { acceptedAt: null, revokedAt: null, expiresAt: future },
        now,
      ),
    ).toBe('PENDING');
  });

  it('is expired at or after the expiry', () => {
    expect(
      inviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: past }, now),
    ).toBe('EXPIRED');
    expect(
      inviteStatus({ acceptedAt: null, revokedAt: null, expiresAt: now }, now),
    ).toBe('EXPIRED');
  });

  it('prefers accepted and revoked over expired', () => {
    expect(
      inviteStatus({ acceptedAt: past, revokedAt: null, expiresAt: past }, now),
    ).toBe('ACCEPTED');
    expect(
      inviteStatus({ acceptedAt: null, revokedAt: past, expiresAt: past }, now),
    ).toBe('REVOKED');
  });
});

describe('inviteUnavailable', () => {
  it.each([
    ['EXPIRED', 'INVITE_EXPIRED'],
    ['REVOKED', 'INVITE_REVOKED'],
    ['ACCEPTED', 'INVITE_ALREADY_ACCEPTED'],
  ] as const)('maps %s to 410 with code %s', (status, code) => {
    const error = inviteUnavailable(status);

    expect(error.getStatus()).toBe(HttpStatus.GONE);
    expect(error.getResponse()).toMatchObject({
      statusCode: 410,
      error: 'Gone',
      code,
    });
  });

  it('can report the same codes as conflicts', () => {
    const error = inviteUnavailable('REVOKED', HttpStatus.CONFLICT);

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toMatchObject({
      error: 'Conflict',
      code: 'INVITE_REVOKED',
    });
  });
});
