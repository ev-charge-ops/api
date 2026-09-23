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
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { SessionDetailResponseDto } from '../../dto/session-detail.response.dto.js';
import { GetSessionService } from './get-session.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class GetSessionController {
  constructor(private readonly service: GetSessionService) {}

  @Get(':sessionId')
  @ApiOperation({
    operationId: 'getSession',
    summary:
      'Get a session of the user, advancing its telemetry, state and fees up to now',
  })
  @ApiOkResponse({ type: SessionDetailResponseDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'sessionId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    sessionId: string,
  ): Promise<SessionDetailResponseDto> {
    return this.service.execute(user.id, sessionId);
  }
}
