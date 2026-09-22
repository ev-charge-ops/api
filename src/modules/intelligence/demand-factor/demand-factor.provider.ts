export const DemandFactorSource = {
  RULE: 'RULE',
  MODEL: 'MODEL',
} as const;

export type DemandFactorSource =
  (typeof DemandFactorSource)[keyof typeof DemandFactorSource];

export const DemandLevel = {
  OFF_PEAK: 'OFF_PEAK',
  NORMAL: 'NORMAL',
  PEAK: 'PEAK',
} as const;

export type DemandLevel = (typeof DemandLevel)[keyof typeof DemandLevel];

export interface DemandFactorInput {
  at: Date;
  chargePointType: 'PRIVATE' | 'COMMERCIAL';
  occupancyRatio: number;
  queueLength: number;
}

export interface DemandFactor {
  factor: number;
  level: DemandLevel;
  source: DemandFactorSource;
  modelVersion: string | null;
}

export abstract class DemandFactorProvider {
  abstract getFactor(input: DemandFactorInput): Promise<DemandFactor>;
}
