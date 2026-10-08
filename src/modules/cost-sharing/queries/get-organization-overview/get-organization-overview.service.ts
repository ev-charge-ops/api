import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import {
  formatMonth,
  previousSaoPauloMonth,
  toSaoPauloTime,
} from '../../../../common/time/sao-paulo-time.js';
import { OrganizationLiveSessions } from '../../../charging-sessions/organization-live-sessions.js';
import {
  CostSharingRepository,
  type OverviewSession,
} from '../../database/cost-sharing.repository.port.js';
import {
  averageDailyPeakKw,
  type DemandInterval,
  percentOf,
  roundTo,
  UPGRADE_ALERT_THRESHOLD_PERCENT,
} from '../../domain/demand-profile.js';
import {
  isVisitorSession,
  monthPeak,
  monthTotals,
} from '../../domain/overview-metrics.js';
import { ChargePointsService } from '../../../charge-points/charge-points.service.js';
import { GetMonthlyStatementService } from '../get-monthly-statement/get-monthly-statement.service.js';
import {
  OrganizationOverviewResponseDto,
  OverviewChargePointDto,
  RecentAnomalyDto,
  type WeeklyEnergyDto,
} from './organization-overview.response.dto.js';

const WH_PER_KWH = 1000;
const DAYS_PER_WEEK = 7;
export const RECENT_ANOMALIES_LIMIT = 5;

@Injectable()
export class GetOrganizationOverviewService {
  constructor(
    private readonly repository: CostSharingRepository,
    private readonly statements: GetMonthlyStatementService,
    private readonly chargePoints: ChargePointsService,
    private readonly liveSessions: OrganizationLiveSessions,
    private readonly clock: Clock,
  ) {}

  async execute(
    organizationId: string,
    month: string | undefined,
  ): Promise<OrganizationOverviewResponseDto> {
    const liveSessions = await this.liveSessions.refresh(organizationId);
    const now = this.clock.now();
    const { range, statement } = await this.statements.resolve(
      organizationId,
      month,
    );
    const sessions = await this.repository.findSessionsStartedIn(
      organizationId,
      range,
    );
    const previousRange = previousSaoPauloMonth(range);
    const previous = monthTotals(
      await this.repository.findSessionsStartedIn(
        organizationId,
        previousRange,
      ),
    );
    const readings = await this.repository.findPowerReadings(
      organizationId,
      range,
    );
    const site = await this.repository.findSiteDemand(organizationId);
    const recentAnomalies = await this.repository.findRecentAnomalies(
      organizationId,
      range.end,
      RECENT_ANOMALIES_LIMIT,
    );
    const anomaliesPendingReviewCount =
      await this.repository.countPendingAnomalyReviews(
        organizationId,
        range.end,
      );
    const points =
      await this.chargePoints.listOrganizationPricing(organizationId);

    const contracted = site.contractedDemandKw ?? 0;
    const reserve = site.commonAreaReserveKw ?? 0;
    const currentDemandKw = roundTo(reserve + site.currentDemandKw, 2);
    const averagePeakDemandKw = roundTo(
      reserve + averageDailyPeakKw(demandIntervals(sessions, now)),
      2,
    );
    const averagePeakUtilizationPercent = percentOf(
      averagePeakDemandKw,
      contracted,
    );
    const totals = monthTotals(sessions);
    const peak = monthPeak(sessions, readings, now);
    const liveByPoint = new Map(
      liveSessions.map((live) => [live.chargePointId, live]),
    );

    return Object.assign(new OrganizationOverviewResponseDto(), {
      month: formatMonth(range),
      energyKwh: totals.energyWh / WH_PER_KWH,
      sessionsCount: totals.sessionsCount,
      energyCents: totals.energyCents,
      totalCents: totals.totalCents,
      previousMonth: {
        month: formatMonth(previousRange),
        energyKwh: previous.energyWh / WH_PER_KWH,
        sessionsCount: previous.sessionsCount,
        energyCents: previous.energyCents,
        totalCents: previous.totalCents,
      },
      visitorSessionsCount: sessions.filter(isVisitorSession).length,
      monthPeak: peak,
      activeSessionsCount: site.activeSessionsCount,
      costSharingTotalCents: statement.totals.totalCents,
      commercialRevenueCents: sessions
        .filter(
          (item) => item.regime === 'COMMERCIAL' && item.status === 'CLOSED',
        )
        .reduce((sum, item) => sum + item.totalCents, 0),
      unitsWithVehicle: statement.lines.filter(
        (line) => line.accessFeeCents > 0,
      ).length,
      unitsWithConsumption: statement.lines.filter((line) => line.energyWh > 0)
        .length,
      capacity: {
        contractedDemandKw: contracted,
        commonAreaReserveKw: reserve,
        chargingDemandKw: site.currentDemandKw,
        currentDemandKw,
        utilizationPercent: percentOf(currentDemandKw, contracted),
        averagePeakDemandKw,
        averagePeakUtilizationPercent,
        upgradeRecommended:
          averagePeakUtilizationPercent > UPGRADE_ALERT_THRESHOLD_PERCENT,
      },
      energyByWeek: energyByWeek(sessions, range.end),
      anomaliesCount: sessions.filter((item) => item.isAnomaly === true).length,
      anomaliesPendingReviewCount,
      recentAnomalies: recentAnomalies.map(({ energyWh, ...row }) =>
        Object.assign(new RecentAnomalyDto(), {
          ...row,
          energyKwh: energyWh / WH_PER_KWH,
        }),
      ),
      chargePoints: points.map((point) => {
        const live = liveByPoint.get(point.id);
        return Object.assign(new OverviewChargePointDto(), point, {
          currentPowerKw: live?.powerKw ?? 0,
          activeSession: live
            ? {
                sessionId: live.sessionId,
                status: live.status,
                graceEndsAt: live.graceEndsAt,
              }
            : null,
        });
      }),
    });
  }
}

function demandIntervals(
  sessions: OverviewSession[],
  now: Date,
): DemandInterval[] {
  return sessions.map((session) => {
    const local = toSaoPauloTime(session.startedAt);
    return {
      start: session.startedAt,
      end: session.chargingEndedAt ?? session.endedAt ?? now,
      powerKw: session.allocatedPowerKw,
      dayKey: `${local.year}-${local.month}-${local.day}`,
    };
  });
}

function energyByWeek(
  sessions: OverviewSession[],
  monthEnd: Date,
): WeeklyEnergyDto[] {
  const lastDay = toSaoPauloTime(new Date(monthEnd.getTime() - 1)).day;
  const weeks = Math.ceil(lastDay / DAYS_PER_WEEK);
  const totals = Array.from({ length: weeks }, () => 0);
  for (const session of sessions) {
    const day = toSaoPauloTime(session.startedAt).day;
    totals[Math.floor((day - 1) / DAYS_PER_WEEK)] += session.energyWh;
  }
  return totals.map((wh, index) => ({
    week: index + 1,
    energyKwh: wh / WH_PER_KWH,
  }));
}
