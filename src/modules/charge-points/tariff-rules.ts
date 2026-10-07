import type { Tariff } from '../../generated/prisma/client.js';
import type { ChargePointType } from '../../generated/prisma/enums.js';

export type TariffTerms = Pick<
  Tariff,
  | 'utilityRateCents'
  | 'baseRateCents'
  | 'accessFeeCents'
  | 'idleFeeCentsPerMinute'
  | 'idleFeeCapCents'
  | 'gracePeriodMinutes'
>;

export const DEFAULT_TARIFF_TERMS: TariffTerms = {
  utilityRateCents: 89,
  baseRateCents: 189,
  accessFeeCents: 3500,
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
};

export function appliesDemandFactor(type: ChargePointType): boolean {
  return type === 'COMMERCIAL';
}

export function pricePerKwhCents(
  type: ChargePointType,
  terms: Pick<TariffTerms, 'utilityRateCents' | 'baseRateCents'>,
  demandFactor: number,
): number {
  if (!appliesDemandFactor(type)) {
    return terms.utilityRateCents;
  }
  const baseRate = terms.baseRateCents ?? terms.utilityRateCents;
  return Math.round(baseRate * demandFactor);
}

export function effectiveTariff<
  T extends Pick<Tariff, 'chargePointId' | 'validFrom'>,
>(tariffs: T[], chargePointId: string, at: Date): T | null {
  const valid = tariffs
    .filter((tariff) => tariff.validFrom.getTime() <= at.getTime())
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
  return (
    valid.find((tariff) => tariff.chargePointId === chargePointId) ??
    valid.find((tariff) => tariff.chargePointId === null) ??
    null
  );
}
