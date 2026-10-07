import type { MonthRange } from '../../../common/time/sao-paulo-time.js';
import type {
  ChargePointType,
  ChargingSessionStatus,
} from '../../../generated/prisma/enums.js';
import type { StatementSession } from '../domain/monthly-statement.js';

export interface OrganizationSessionRow {
  id: string;
  status: ChargingSessionStatus;
  regime: ChargePointType;
  chargePoint: { id: string; code: string; name: string };
  driver: { id: string; name: string };
  unitLabel: string | null;
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  energyWh: number;
  lockedRateCents: number;
  demandFactor: number;
  energyCostCents: number;
  idleMinutes: number;
  idleFeeCents: number;
  totalCents: number;
  anomalyScore: number | null;
  isAnomaly: boolean | null;
}

export interface OrganizationSessionFilters {
  range: MonthRange | null;
  unitLabel?: string;
  status?: ChargingSessionStatus;
  chargePointId?: string;
  anomaly?: boolean;
}

export interface OverviewSession {
  regime: ChargePointType;
  status: ChargingSessionStatus;
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  energyWh: number;
  totalCents: number;
  allocatedPowerKw: number;
}

export interface SiteDemand {
  contractedDemandKw: number | null;
  commonAreaReserveKw: number | null;
  activeSessionsCount: number;
  currentDemandKw: number;
}

export abstract class CostSharingRepository {
  abstract findBillableSessions(
    organizationId: string,
    range: MonthRange,
  ): Promise<StatementSession[]>;

  abstract findUnitsWithVehicle(organizationId: string): Promise<string[]>;

  abstract findAccessFeeCents(
    organizationId: string,
    at: Date,
  ): Promise<number>;

  abstract listSessions(
    organizationId: string,
    filters: OrganizationSessionFilters,
    page: { skip: number; take: number },
  ): Promise<{ items: OrganizationSessionRow[]; total: number }>;

  abstract findSessionsStartedIn(
    organizationId: string,
    range: MonthRange,
  ): Promise<OverviewSession[]>;

  abstract findSiteDemand(organizationId: string): Promise<SiteDemand>;
}
