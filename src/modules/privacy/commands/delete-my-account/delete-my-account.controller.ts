import { Body, Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
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
import { AuthRateLimit } from '../../../../common/rate-limit/auth-rate-limit.decorator.js';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user.js';
import { DeletionRequestResponseDto } from '../../dto/deletion-request.response.dto.js';
import { DeleteMyAccountRequestDto } from './delete-my-account.request.dto.js';
import { DeleteMyAccountService } from './delete-my-account.service.js';

@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('me')
export class DeleteMyAccountController {
  constructor(private readonly service: DeleteMyAccountService) {}

  @AuthRateLimit()
  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'deleteMyAccount',
    summary: 'Delete the account of the authenticated user now',
    description:
      'Sends a confirmation email to the current address, then, in one transaction, anonymizes the user (name "Usuário excluído", email deleted+<id>@evchargeops.invalid, no password), deletes the Google/Apple identities, refresh tokens, push tokens and one-time tokens, and completes the deletion request (creating one when there is none). Sessions and memberships stay for the condo cost sharing under the anonymized name. The TEST and LIVE Stripe customers are deleted afterwards on a best-effort basis. The access token stops being refreshable; the app must sign out.',
  })
  @ApiOkResponse({
    type: DeletionRequestResponseDto,
    description: 'The completed deletion request',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid payload (confirm must be EXCLUIR) or INVALID_PASSWORD: the password is missing or incorrect for an account with a password',
  })
  @ApiConflictResponse({
    description:
      'LAST_MANAGER: the user is the only manager of an organization',
  })
  deleteMyAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteMyAccountRequestDto,
  ): Promise<DeletionRequestResponseDto> {
    return this.service.execute(user.id, dto);
  }
}
