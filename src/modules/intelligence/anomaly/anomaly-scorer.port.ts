export interface SessionFeatures {
  chargePointType: 'PRIVATE' | 'COMMERCIAL';
  startHour: number;
  dayOfWeek: number;
  energyKwh: number;
  durationMinutes: number;
  idleMinutes: number;
  averagePowerKw: number;
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
