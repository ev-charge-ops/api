export const AnomalyReviewStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  CONFIRMED: 'CONFIRMED',
  DISMISSED: 'DISMISSED',
} as const;

export type AnomalyReviewStatus =
  (typeof AnomalyReviewStatus)[keyof typeof AnomalyReviewStatus];

export const ANOMALY_REVIEW_DECISIONS = [
  AnomalyReviewStatus.CONFIRMED,
  AnomalyReviewStatus.DISMISSED,
] as const;

export type AnomalyReviewDecision = (typeof ANOMALY_REVIEW_DECISIONS)[number];

export interface AnomalyReview {
  decision: AnomalyReviewDecision;
  note: string | null;
  reviewerId: string;
  at: Date;
}

export function reviewStatusFor(
  isAnomaly: boolean | null,
): AnomalyReviewStatus | null {
  return isAnomaly === true ? AnomalyReviewStatus.PENDING_REVIEW : null;
}
