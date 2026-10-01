import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequireOrganizationRole } from '../../../organizations/guards/require-organization-role.decorator.js';
import { OrganizationSessionDetailResponseDto } from '../../dto/organization-session-detail.response.dto.js';
import { GetOrganizationSessionService } from './get-organization-session.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/sessions')
export class GetOrganizationSessionController {
  constructor(private readonly service: GetOrganizationSessionService) {}

  @Get(':sessionId')
  @ApiOperation({
    operationId: 'getOrganizationSession',
    summary:
      'Get a session of the organization (managers only) with its driver, advancing its telemetry, state and fees up to now',
  })
  @ApiOkResponse({ type: OrganizationSessionDetailResponseDto })
  @ApiNotFoundResponse({
    description: 'SESSION_NOT_FOUND, or organization not found',
  })
  getOrganizationSession(
    @Param('organizationId') organizationId: string,
    @Param(
      'sessionId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    sessionId: string,
  ): Promise<OrganizationSessionDetailResponseDto> {
    return this.service.execute(organizationId, sessionId);
  }
}
