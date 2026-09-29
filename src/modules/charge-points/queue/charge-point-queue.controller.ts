import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import { ChargePointQueue } from './charge-point-queue.js';
import { QueueEntryResponseDto } from './dto/queue-entry.response.dto.js';

const chargePointIdPipe = new ParseUUIDPipe({
  errorHttpStatusCode: HttpStatus.NOT_FOUND,
});

@ApiTags('charge-points')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Controller('charge-points/:chargePointId/queue')
export class ChargePointQueueController {
  constructor(private readonly queue: ChargePointQueue) {}

  @Post()
  @ApiOperation({
    operationId: 'joinChargePointQueue',
    summary:
      'Join the queue of a busy charge point; when it frees up, the head of the queue gets a 10 minute reservation and a QUEUE_TURN notification',
  })
  @ApiCreatedResponse({ type: QueueEntryResponseDto })
  @ApiNotFoundResponse({ description: 'Charge point not found' })
  @ApiConflictResponse({
    description:
      'CHARGE_POINT_AVAILABLE, CHARGE_POINT_OFFLINE, QUEUE_OWN_SESSION, ALREADY_IN_QUEUE or ACTIVE_QUEUE_EXISTS (one queue per user)',
  })
  joinChargePointQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chargePointId', chargePointIdPipe) chargePointId: string,
  ): Promise<QueueEntryResponseDto> {
    return this.queue.join(user.id, chargePointId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'leaveChargePointQueue',
    summary:
      'Leave the queue of the charge point, giving up a reservation if you hold one',
  })
  @ApiNoContentResponse({ description: 'Left the queue' })
  @ApiNotFoundResponse({ description: 'QUEUE_ENTRY_NOT_FOUND' })
  leaveChargePointQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chargePointId', chargePointIdPipe) chargePointId: string,
  ): Promise<void> {
    return this.queue.leave(user.id, chargePointId);
  }

  @Get('me')
  @ApiOperation({
    operationId: 'getMyQueueEntry',
    summary:
      'Your latest entry in the queue of the charge point with the position, status and reservation',
  })
  @ApiOkResponse({ type: QueueEntryResponseDto })
  @ApiNotFoundResponse({
    description: 'Charge point not found or QUEUE_ENTRY_NOT_FOUND',
  })
  getMyQueueEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('chargePointId', chargePointIdPipe) chargePointId: string,
  ): Promise<QueueEntryResponseDto> {
    return this.queue.mine(user.id, chargePointId);
  }
}
