import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { ListMySessionsQueryDto } from './list-my-sessions.query.dto.js';
import { ListMySessionsService } from './list-my-sessions.service.js';
import { SessionPageResponseDto } from './session-page.response.dto.js';

@ApiTags('sessions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('sessions')
export class ListMySessionsController {
  constructor(private readonly service: ListMySessionsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listMySessions',
    summary:
      'List the sessions of the user, newest first, optionally limited to the sessions started in a month',
  })
  @ApiOkResponse({ type: SessionPageResponseDto })
  listMySessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMySessionsQueryDto,
  ): Promise<SessionPageResponseDto> {
    return this.service.execute(user.id, query);
  }
}
