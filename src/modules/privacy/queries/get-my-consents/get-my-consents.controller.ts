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
import { MyConsentsResponseDto } from '../../dto/my-consents.response.dto.js';
import { GetMyConsentsService } from './get-my-consents.service.js';

@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/consents')
export class GetMyConsentsController {
  constructor(private readonly service: GetMyConsentsService) {}

  @Get()
  @ApiOperation({
    operationId: 'getMyConsents',
    summary:
      'Current LGPD consent per purpose, the current terms version and whether the user must accept the terms again',
  })
  @ApiOkResponse({ type: MyConsentsResponseDto })
  getMyConsents(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyConsentsResponseDto> {
    return this.service.execute(user.id);
  }
}
