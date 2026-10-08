import type { MonthRange } from '../../../common/time/sao-paulo-time.js';
import type {
  AnomalyReviewStatus,
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
  anomalyReviewStatus: AnomalyReviewStatus | null;
  anomalyReviewNote: string | null;
  anomalyReviewedAt: Date | null;
  anomalyReviewedById: string | null;
}

export interface OrganizationSessionFilters {
  range: MonthRange | null;
  unitLabel?: string;
  status?: ChargingSessionStatus;
  chargePointId?: string;
  anomaly?: boolean;
  reviewStatus?: AnomalyReviewStatus;
}

export interface OverviewSession {
  id: string;
  regime: ChargePointType;
  status: ChargingSessionStatus;
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  energyWh: number;
  energyCostCents: number;
  totalCents: number;
  allocatedPowerKw: number;
  isAnomaly: boolean | null;
  isMember: boolean;
}

export interface SessionPowerReading {
  at: Date;
  powerKw: number;
}

export interface RecentAnomalyRow {
  sessionId: string;
  status: ChargingSessionStatus;
  regime: ChargePointType;
  chargePoint: { id: string; code: string; name: string };
  driver: { id: string; name: string };
  unitLabel: string | null;
  startedAt: Date;
  endedAt: Date | null;
  energyWh: number;
  idleMinutes: number;
  totalCents: number;
  anomalyScore: number | null;
  anomalyModelVersion: string | null;
  anomalyReviewStatus: AnomalyReviewStatus | null;
  anomalyReviewNote: string | null;
  anomalyReviewedAt: Date | null;
  anomalyReviewedById: string | null;
}

export interface SiteDemand {
  contractedDemandKw: number | null;
  commonAreaReserveKw: number | null;
  activeSessionsCount: number;
  currentDemandKw: number;
}

export interface OrganizationRates {
  accessFeeCents: number;
  utilityRateCents: number | null;
}

export interface UnitMembership {
  organization: { id: string; name: string };
  unitLabel: string;
}

export abstract class CostSharingRepository {
  abstract findBillableSessions(
    organizationId: string,
    range: MonthRange,
  ): Promise<StatementSession[]>;

  abstract findUnitsWithVehicle(organizationId: string): Promise<string[]>;

  abstract findOrganizationRates(
    organizationId: string,
    at: Date,
  ): Promise<OrganizationRates>;

  abstract findUnitMemberships(userId: string): Promise<UnitMembership[]>;

  abstract listSessions(
    organizationId: string,
    filters: OrganizationSessionFilters,
    page: { skip: number; take: number },
  ): Promise<{ items: OrganizationSessionRow[]; total: number }>;

  abstract findSessionsStartedIn(
    organizationId: string,
    range: MonthRange,
  ): Promise<OverviewSession[]>;

  abstract findPowerReadings(
    organizationId: string,
    range: MonthRange,
  ): Promise<Map<string, SessionPowerReading[]>>;

  abstract findRecentAnomalies(
    organizationId: string,
    before: Date,
    limit: number,
  ): Promise<RecentAnomalyRow[]>;

  abstract countPendingAnomalyReviews(
    organizationId: string,
    before: Date,
  ): Promise<number>;

  abstract findSiteDemand(organizationId: string): Promise<SiteDemand>;
}
