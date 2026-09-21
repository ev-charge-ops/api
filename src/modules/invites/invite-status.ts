import type { Invite } from '../../generated/prisma/client.js';

export const InviteStatus = {
  PENDING: 'PENDING',
  EXPIRED: 'EXPIRED',
  ACCEPTED: 'ACCEPTED',
  REVOKED: 'REVOKED',
} as const;

export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];

export function inviteStatus(
  invite: Pick<Invite, 'acceptedAt' | 'revokedAt' | 'expiresAt'>,
  now: Date = new Date(),
): InviteStatus {
  if (invite.acceptedAt) {
    return InviteStatus.ACCEPTED;
  }
  if (invite.revokedAt) {
    return InviteStatus.REVOKED;
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return InviteStatus.EXPIRED;
  }
  return InviteStatus.PENDING;
}
