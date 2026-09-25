import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListChargePointsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only the points of this organization that the user can see: all of them for members, the commercial ones otherwise',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
