import { Body, Controller, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { MyConsentsResponseDto } from '../../dto/my-consents.response.dto.js';
import { UpdateMyConsentsRequestDto } from './update-my-consents.request.dto.js';
import { UpdateMyConsentsService } from './update-my-consents.service.js';

@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/consents')
export class UpdateMyConsentsController {
  constructor(private readonly service: UpdateMyConsentsService) {}

  @Put()
  @ApiOperation({
    operationId: 'updateMyConsents',
    summary:
      'Accept the current terms and record the consent choices; every change is appended to the history',
  })
  @ApiOkResponse({ type: MyConsentsResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid payload or REQUIRED_CONSENT: a required purpose was sent as not granted',
  })
  @ApiConflictResponse({
    description:
      'TERMS_VERSION_OUTDATED: the terms version is not the current one',
  })
  updateMyConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMyConsentsRequestDto,
  ): Promise<MyConsentsResponseDto> {
    return this.service.execute(user.id, dto);
  }
}
