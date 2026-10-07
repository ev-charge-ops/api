export type ChargingLimit =
  | { type: 'FULL' }
  | { type: 'ENERGY'; energyWh: number }
  | { type: 'AMOUNT'; amountCents: number };

export interface Vehicle {
  batteryCapacityWh: number;
  socPercent: number;
}

export function energyToFullWh(vehicle: Vehicle): number {
  const missing = Math.max(0, 100 - vehicle.socPercent);
  return Math.round((vehicle.batteryCapacityWh * missing) / 100);
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
