export const ChargePointStatus = {
  AVAILABLE: 'AVAILABLE',
  CHARGING: 'CHARGING',
  IDLE: 'IDLE',
  OFFLINE: 'OFFLINE',
} as const;

export type ChargePointStatus =
  (typeof ChargePointStatus)[keyof typeof ChargePointStatus];

export type OccupyingSessionStatus =
  'AWAITING_PAYMENT' | 'PENDING' | 'ACTIVE' | 'GRACE' | 'IDLE';

export function chargePointStatus(
  isOnline: boolean,
  occupyingSession: OccupyingSessionStatus | null,
): ChargePointStatus {
  if (!isOnline) {
    return ChargePointStatus.OFFLINE;
  }
  switch (occupyingSession) {
    case null:
      return ChargePointStatus.AVAILABLE;
    case 'AWAITING_PAYMENT':
    case 'PENDING':
    case 'ACTIVE':
      return ChargePointStatus.CHARGING;
    case 'GRACE':
    case 'IDLE':
      return ChargePointStatus.IDLE;
  }
}

export function isBusy(status: ChargePointStatus): boolean {
  return (
    status === ChargePointStatus.CHARGING || status === ChargePointStatus.IDLE
  );
}

export function occupancyRatio(statuses: ChargePointStatus[]): number {
  const online = statuses.filter(
    (status) => status !== ChargePointStatus.OFFLINE,
  );
  if (online.length === 0) {
    return 0;
  }
  return online.filter(isBusy).length / online.length;
}
