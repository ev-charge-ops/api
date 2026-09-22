import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequireOrganizationRole } from '../organizations/guards/require-organization-role.decorator.js';
import { TariffResponseDto } from './dto/tariff.response.dto.js';
import { UpdateTariffDto } from './dto/update-tariff.dto.js';
import { TariffsService } from './tariffs.service.js';

@ApiTags('charge-points')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('organizations/:organizationId/tariff')
export class OrganizationTariffController {
  constructor(private readonly tariffs: TariffsService) {}

  @Get()
  @RequireOrganizationRole()
  @ApiOperation({
    operationId: 'getOrganizationTariff',
    summary: 'Get the tariff currently in force for the organization',
  })
  @ApiOkResponse({ type: TariffResponseDto })
  @ApiNotFoundResponse({ description: 'Tariff not configured' })
  getOrganizationTariff(
    @Param('organizationId') organizationId: string,
  ): Promise<TariffResponseDto> {
    return this.tariffs.getForOrganization(organizationId);
  }

  @Patch()
  @RequireOrganizationRole('MANAGER')
  @ApiOperation({
    operationId: 'updateOrganizationTariff',
    summary:
      'Change the tariff of the organization (managers only). Creates a new version valid from now; running sessions keep their locked price',
  })
  @ApiOkResponse({ type: TariffResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  updateOrganizationTariff(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateTariffDto,
  ): Promise<TariffResponseDto> {
    return this.tariffs.updateForOrganization(organizationId, dto);
  }
}
