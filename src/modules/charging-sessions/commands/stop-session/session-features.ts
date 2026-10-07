import { toSaoPauloTime } from '../../../../common/time/sao-paulo-time.js';
import type { SessionFeatures } from '../../../intelligence/anomaly/anomaly-scorer.port.js';
import type { ChargingSessionProps } from '../../domain/charging-session.entity.js';
import { sessionMinutesBetween } from '../../domain/session-fees.js';

export function sessionFeatures(props: ChargingSessionProps): SessionFeatures {
  const local = toSaoPauloTime(props.startedAt);
  const chargingMinutes = sessionMinutesBetween(
    props.startedAt,
    props.chargingEndedAt ?? props.endedAt ?? props.startedAt,
    props.timeScale,
  );
  const energyKwh = props.energyWh / 1000;
  const averagePowerKw =
    chargingMinutes > 0
      ? Math.round((energyKwh / (chargingMinutes / 60)) * 100) / 100
      : 0;
  return {
    chargePointType: props.regime,
    hour: local.hour,
    dayOfWeek: local.dayOfWeek,
    energyKwh,
    chargingMinutes,
    idleMinutes: props.idleMinutes,
    averagePowerKw,
    allocatedPowerKw: props.allocatedPowerKw,
    totalCents: props.totalCents,
  };
}
