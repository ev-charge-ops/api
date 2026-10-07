import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ChargePointsService } from './charge-points.service.js';
import { ChargePointClusterResponseDto } from './dto/charge-point-cluster.response.dto.js';
import { ChargePointMapItemResponseDto } from './dto/charge-point-map-item.response.dto.js';
import { ChargePointResponseDto } from './dto/charge-point.response.dto.js';
import { ListChargePointClustersQueryDto } from './dto/list-charge-point-clusters.query.dto.js';
import { ListChargePointsQueryDto } from './dto/list-charge-points.query.dto.js';
import { parseBoundingBox } from './geo.js';

@ApiTags('charge-points')
@ApiExtraModels(ChargePointResponseDto, ChargePointMapItemResponseDto)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('charge-points')
export class ChargePointsController {
  constructor(private readonly chargePoints: ChargePointsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listChargePoints',
    summary:
      'List the charge points visible to the user. With bbox: light map items (ChargePointMapItemResponseDto) inside the viewport, nearest to its center first, up to limit, priced without calling the model. With organizationId: every visible point of that organization (ChargePointResponseDto). Without filters (app 1.4.0): the private points of the organizations of the user plus the commercial points within 25 km of the centroid of their condo (or of São Paulo), at most 200 (ChargePointResponseDto)',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        {
          type: 'array',
          items: { $ref: getSchemaPath(ChargePointResponseDto) },
        },
        {
          type: 'array',
          items: { $ref: getSchemaPath(ChargePointMapItemResponseDto) },
        },
      ],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid filters' })
  listChargePoints(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListChargePointsQueryDto,
  ): Promise<ChargePointResponseDto[] | ChargePointMapItemResponseDto[]> {
    const box = query.bbox ? parseBoundingBox(query.bbox) : null;
    if (box) {
      return this.chargePoints.listInBox(user.id, box, query.limit);
    }
    return this.chargePoints.list(user.id, query.organizationId);
  }

  @Get('clusters')
  @ApiOperation({
    operationId: 'listChargePointClusters',
    summary:
      'Group the charge points visible to the user inside the viewport in a grid whose cell size follows the zoom, for zoomed out maps (zoom 9 or less)',
  })
  @ApiOkResponse({ type: [ChargePointClusterResponseDto] })
  @ApiBadRequestResponse({ description: 'Invalid bbox or zoom' })
  listChargePointClusters(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListChargePointClustersQueryDto,
  ): Promise<ChargePointClusterResponseDto[]> {
    const box = parseBoundingBox(query.bbox);
    if (!box) {
      return Promise.resolve([]);
    }
    return this.chargePoints.listClusters(user.id, box, query.zoom);
  }

  @Get(':chargePointId')
  @ApiOperation({
    operationId: 'getChargePoint',
    summary: 'Get a charge point visible to the user',
  })
  @ApiOkResponse({ type: ChargePointResponseDto })
  @ApiNotFoundResponse({ description: 'Charge point not found' })
  getChargePoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'chargePointId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    chargePointId: string,
  ): Promise<ChargePointResponseDto> {
    return this.chargePoints.get(user.id, chargePointId);
  }
}
