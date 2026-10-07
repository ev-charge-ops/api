import { ApiProperty } from '@nestjs/swagger';

export class ChargePointClusterResponseDto {
  @ApiProperty({
    example: -23.5612,
    description: 'Average latitude of the points in the cell',
  })
  latitude: number;

  @ApiProperty({
    example: -46.6421,
    description: 'Average longitude of the points in the cell',
  })
  longitude: number;

  @ApiProperty({ example: 42, description: 'Points in the cell' })
  count: number;

  @ApiProperty({
    example: 30,
    description: 'Online points in the cell without an open session',
  })
  availableCount: number;
}
