import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { IsBoundingBox } from '../geo.js';

export const MAX_CLUSTER_ZOOM = 22;

export class ListChargePointClustersQueryDto {
  @ApiProperty({
    example: '-74,-34,-34,6',
    description: 'Map viewport as minLng,minLat,maxLng,maxLat',
  })
  @IsBoundingBox()
  bbox: string;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_CLUSTER_ZOOM,
    example: 5,
    description:
      'Map zoom level; each grid cell is a quarter of a 256 px map tile at this zoom (360 / 2^zoom / 4 degrees)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_CLUSTER_ZOOM)
  zoom: number;
}
