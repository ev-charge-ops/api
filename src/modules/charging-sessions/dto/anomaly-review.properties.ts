import type { ApiPropertyOptions } from '@nestjs/swagger';
import { AnomalyReviewStatus } from '../../../generated/prisma/enums.js';

export const ANOMALY_REVIEW_STATUS_PROPERTY: ApiPropertyOptions = {
  enum: AnomalyReviewStatus,
  enumName: 'AnomalyReviewStatus',
  nullable: true,
  description:
    'Manager review of the anomaly flag: PENDING_REVIEW for flagged sessions not reviewed yet, CONFIRMED or DISMISSED after the review, null when the session is not flagged. Billing never changes with the review',
};

export const ANOMALY_REVIEW_NOTE_PROPERTY: ApiPropertyOptions = {
  type: String,
  nullable: true,
  example: 'Morador confirmou a recarga de um veículo visitante',
};

export const ANOMALY_REVIEWED_AT_PROPERTY: ApiPropertyOptions = {
  type: String,
  format: 'date-time',
  nullable: true,
};

export const ANOMALY_REVIEWED_BY_ID_PROPERTY: ApiPropertyOptions = {
  type: String,
  format: 'uuid',
  nullable: true,
  description: 'Manager who reviewed the anomaly',
};
