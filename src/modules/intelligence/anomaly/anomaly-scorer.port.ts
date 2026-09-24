export interface SessionFeatures {
  chargePointType: 'PRIVATE' | 'COMMERCIAL';
  hour: number;
  dayOfWeek: number;
  energyKwh: number;
  chargingMinutes: number;
  idleMinutes: number;
  averagePowerKw: number;
  allocatedPowerKw: number;
  totalCents: number;
}

export interface AnomalyScore {
  score: number;
  isAnomaly: boolean;
  modelVersion: string | null;
}

export abstract class AnomalyScorer {
  abstract score(features: SessionFeatures): Promise<AnomalyScore | null>;
}

export class DisabledAnomalyScorer extends AnomalyScorer {
  score(): Promise<AnomalyScore | null> {
    return Promise.resolve(null);
  }
}
