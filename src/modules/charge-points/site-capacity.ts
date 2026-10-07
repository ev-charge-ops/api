export interface SiteCapacity {
  contractedDemandKw: number;
  commonAreaReserveKw: number;
  minChargingPowerKw: number;
}

export interface PowerAllocationRequest {
  maxPowerKw: number;
  capacity: SiteCapacity | null;
  activeSessionsKw: number;
}

export function chargingHeadroomKw(
  capacity: SiteCapacity,
  activeSessionsKw: number,
): number {
  return (
    capacity.contractedDemandKw -
    capacity.commonAreaReserveKw -
    activeSessionsKw
  );
}

export function allocatePowerKw(
  request: PowerAllocationRequest,
): number | null {
  const { maxPowerKw, capacity, activeSessionsKw } = request;
  if (!capacity) {
    return maxPowerKw;
  }
  const headroom = chargingHeadroomKw(capacity, activeSessionsKw);
  const minimum = Math.min(capacity.minChargingPowerKw, maxPowerKw);
  if (headroom < minimum) {
    return null;
  }
  return Math.round(Math.min(maxPowerKw, headroom) * 100) / 100;
}
