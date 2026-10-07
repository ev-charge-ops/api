import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
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
import { SessionResponseDto } from '../../dto/session.response.dto.js';
import { StopSessionService } from './stop-session.service.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class StopSessionController {
  constructor(private readonly service: StopSessionService) {}

  @Post(':sessionId/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'stopSession',
    summary:
      'End the session: stops charging early with the partial energy, or unplugs during grace/idle freezing the idle fee',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SESSION_ALREADY_ENDED' })
  stopSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'sessionId',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    sessionId: string,
  ): Promise<SessionResponseDto> {
    return this.service.execute(user.id, sessionId);
  }
}
