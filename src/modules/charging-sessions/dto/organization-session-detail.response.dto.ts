import { ApiProperty } from '@nestjs/swagger';
import { OrganizationSessionDriverDto } from '../../cost-sharing/queries/list-organization-sessions/organization-session.response.dto.js';
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
}
