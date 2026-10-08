import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { IsExclusiveOf } from '../../../common/validation/is-exclusive-of.decorator.js';
import { IsBoundingBox } from '../geo.js';

export const DEFAULT_MAP_LIMIT = 300;
export const MAX_MAP_LIMIT = 1000;

export class ListChargePointsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only the points of this organization that the user can see: all of them for members, the commercial ones otherwise',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({
    example: '-46.75,-23.65,-46.55,-23.45',
    description:
      'Map viewport as minLng,minLat,maxLng,maxLat. When set, the response is a list of ChargePointMapItemResponseDto (light map items, nearest to the center first) instead of ChargePointResponseDto',
  })
  @IsOptional()
  @IsBoundingBox()
  @IsExclusiveOf(['organizationId'])
  bbox?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_MAP_LIMIT,
    default: DEFAULT_MAP_LIMIT,
    description: 'Maximum number of map items returned with bbox',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MAP_LIMIT)
  limit: number = DEFAULT_MAP_LIMIT;
}
