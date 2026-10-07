import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { ActiveSessionResponseDto } from './active-session.response.dto.js';
import { GetActiveSessionService } from './get-active-session.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class GetActiveSessionController {
  constructor(private readonly service: GetActiveSessionService) {}

  @Get('active')
  @ApiOperation({
    operationId: 'getActiveSession',
    summary:
      'Get the open session of the user (charging, grace or idle), advanced up to now',
  })
  @ApiOkResponse({ type: ActiveSessionResponseDto })
  getActiveSession(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActiveSessionResponseDto> {
    return this.service.execute(user.id);
  }
}
