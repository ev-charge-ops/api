import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { RequireOrganizationRole } from '../../../organizations/guards/require-organization-role.decorator.js';
import { OrganizationSessionDetailResponseDto } from '../../dto/organization-session-detail.response.dto.js';
import { ReviewSessionAnomalyRequestDto } from './review-session-anomaly.request.dto.js';
import { ReviewSessionAnomalyService } from './review-session-anomaly.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@RequireOrganizationRole('MANAGER')
@Controller('organizations/:organizationId/sessions')
export class ReviewSessionAnomalyController {
  constructor(private readonly service: ReviewSessionAnomalyService) {}

  @Post(':sessionId/anomaly-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'reviewSessionAnomaly',
    summary:
      'Confirm or dismiss the anomaly flag of a session of the organization (managers only), with an optional note. Reviewing again replaces the previous decision; billing does not change',
  })
  @ApiOkResponse({ type: OrganizationSessionDetailResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid status or note' })
  @ApiNotFoundResponse({
    description: 'SESSION_NOT_FOUND, or organization not found',
  })
  @ApiConflictResponse({
    description: 'SESSION_NOT_FLAGGED: the session is not flagged as anomalous',
  })
  reviewSessionAnomaly(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param(
      'sessionId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    sessionId: string,
    @Body() dto: ReviewSessionAnomalyRequestDto,
  ): Promise<OrganizationSessionDetailResponseDto> {
    return this.service.execute({
      organizationId,
      sessionId,
      reviewerId: user.id,
      decision: dto.status,
      note: dto.note || null,
    });
  }
}
