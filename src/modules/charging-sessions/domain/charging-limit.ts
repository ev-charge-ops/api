export type ChargingLimit =
  | { type: 'FULL' }
  | { type: 'ENERGY'; energyWh: number }
  | { type: 'AMOUNT'; amountCents: number }
  | { type: 'PERCENT'; socPercent: number };

export interface Vehicle {
  batteryCapacityWh: number;
  socPercent: number;
}

export function energyToFullWh(vehicle: Vehicle): number {
  return energyToSocWh(vehicle, 100);
}

export function energyToSocWh(vehicle: Vehicle, socPercent: number): number {
  const missing = Math.max(0, Math.min(100, socPercent) - vehicle.socPercent);
  return Math.round((vehicle.batteryCapacityWh * missing) / 100);
}

export function isReachableSoc(vehicle: Vehicle, socPercent: number): boolean {
  return socPercent > vehicle.socPercent;
}

export function targetEnergyWh(
  limit: ChargingLimit,
  vehicle: Vehicle,
  rateCentsPerKwh: number,
): number {
  const full = energyToFullWh(vehicle);
  switch (limit.type) {
    case 'FULL':
      return full;
    case 'ENERGY':
      return Math.min(full, limit.energyWh);
    case 'PERCENT':
      return energyToSocWh(vehicle, limit.socPercent);
    case 'AMOUNT':
      if (rateCentsPerKwh <= 0) {
        return full;
      }
      return Math.min(
        full,
        Math.floor((limit.amountCents * 1000) / rateCentsPerKwh),
      );
  }
}
