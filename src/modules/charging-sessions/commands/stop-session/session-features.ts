import { toSaoPauloTime } from '../../../../common/time/sao-paulo-time.js';
import type { SessionFeatures } from '../../../intelligence/anomaly/anomaly-scorer.port.js';
import { mlDayOfWeek } from '../../../intelligence/ml/ml-http-client.js';
import { sessionMinutesBetween } from '../../domain/session-fees.js';

export interface SessionTimeline {
  regime: 'PRIVATE' | 'COMMERCIAL';
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  energyWh: number;
  timeScale: number;
}

export function sessionFeatures(session: SessionTimeline): SessionFeatures {
  const local = toSaoPauloTime(session.startedAt);
  const chargingEnd =
    session.chargingEndedAt ?? session.endedAt ?? session.startedAt;
  const chargingMinutes = sessionMinutesBetween(
    session.startedAt,
    chargingEnd,
    session.timeScale,
  );
  const durationMinutes = Math.max(
    chargingMinutes,
    sessionMinutesBetween(
      session.startedAt,
      session.endedAt ?? chargingEnd,
      session.timeScale,
    ),
  );
  const energyKwh = session.energyWh / 1000;
  const averagePowerKw =
    durationMinutes > 0
      ? Math.round((energyKwh / (durationMinutes / 60)) * 100) / 100
      : 0;
  return {
    chargePointType: session.regime,
    startHour: local.hour,
    dayOfWeek: mlDayOfWeek(local.dayOfWeek),
    energyKwh,
    durationMinutes,
    idleMinutes: durationMinutes - chargingMinutes,
    averagePowerKw,
  };
}
