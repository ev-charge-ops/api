export const SessionStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  GRACE: 'GRACE',
  IDLE: 'IDLE',
  CLOSED: 'CLOSED',
  INTERRUPTED: 'INTERRUPTED',
} as const;

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const OPEN_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.ACTIVE,
  SessionStatus.GRACE,
  SessionStatus.IDLE,
];

export function isOpenStatus(status: SessionStatus): boolean {
  return OPEN_SESSION_STATUSES.includes(status);
}
