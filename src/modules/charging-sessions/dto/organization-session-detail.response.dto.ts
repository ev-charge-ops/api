import { ApiProperty } from '@nestjs/swagger';
import type { AnomalyReviewStatus } from '../../../generated/prisma/enums.js';
import { OrganizationSessionDriverDto } from '../../cost-sharing/queries/list-organization-sessions/organization-session.response.dto.js';
import {
  ANOMALY_REVIEW_NOTE_PROPERTY,
  ANOMALY_REVIEW_STATUS_PROPERTY,
  ANOMALY_REVIEWED_AT_PROPERTY,
  ANOMALY_REVIEWED_BY_ID_PROPERTY,
} from './anomaly-review.properties.js';
import { SessionDetailResponseDto } from './session-detail.response.dto.js';

export class OrganizationSessionDetailResponseDto extends SessionDetailResponseDto {
  @ApiProperty({ type: OrganizationSessionDriverDto })
  driver: OrganizationSessionDriverDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Version of the ML model that produced the anomaly score',
  })
  anomalyModelVersion: string | null;

  @ApiProperty(ANOMALY_REVIEW_STATUS_PROPERTY)
  anomalyReviewStatus: AnomalyReviewStatus | null;

  @ApiProperty(ANOMALY_REVIEW_NOTE_PROPERTY)
  anomalyReviewNote: string | null;

  @ApiProperty(ANOMALY_REVIEWED_AT_PROPERTY)
  anomalyReviewedAt: Date | null;

  @ApiProperty(ANOMALY_REVIEWED_BY_ID_PROPERTY)
  anomalyReviewedById: string | null;
}
