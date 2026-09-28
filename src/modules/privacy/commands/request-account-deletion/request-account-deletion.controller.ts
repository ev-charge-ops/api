import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { DeletionRequestResponseDto } from '../../dto/deletion-request.response.dto.js';
import { RequestAccountDeletionRequestDto } from './request-account-deletion.request.dto.js';
import { RequestAccountDeletionService } from './request-account-deletion.service.js';

@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me/deletion-request')
export class RequestAccountDeletionController {
  constructor(private readonly service: RequestAccountDeletionService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: 'requestAccountDeletion',
    summary:
      'Record a request to delete the account and its data; repeated calls return the pending request',
  })
  @ApiAcceptedResponse({ type: DeletionRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  requestAccountDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestAccountDeletionRequestDto,
  ): Promise<DeletionRequestResponseDto> {
    return this.service.execute(user.id, dto);
  }
}
