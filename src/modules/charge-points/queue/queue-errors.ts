import { HttpException, HttpStatus } from '@nestjs/common';

export const QueueErrorCode = {
  CHARGE_POINT_AVAILABLE: 'CHARGE_POINT_AVAILABLE',
  CHARGE_POINT_OFFLINE: 'CHARGE_POINT_OFFLINE',
  QUEUE_OWN_SESSION: 'QUEUE_OWN_SESSION',
  ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
  ACTIVE_QUEUE_EXISTS: 'ACTIVE_QUEUE_EXISTS',
  QUEUE_ENTRY_NOT_FOUND: 'QUEUE_ENTRY_NOT_FOUND',
} as const;

export type QueueErrorCode =
  (typeof QueueErrorCode)[keyof typeof QueueErrorCode];

const ERROR_NAMES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
};

export function queueError(
  status: HttpStatus,
  code: QueueErrorCode,
  message: string,
): HttpException {
  return new HttpException(
    { statusCode: status, error: ERROR_NAMES[status], message, code },
    status,
  );
}

export function queueConflict(
  code: QueueErrorCode,
  message: string,
): HttpException {
  return queueError(HttpStatus.CONFLICT, code, message);
}

export function queueEntryNotFound(): HttpException {
  return queueError(
    HttpStatus.NOT_FOUND,
    QueueErrorCode.QUEUE_ENTRY_NOT_FOUND,
    'You are not in the queue of this charge point',
  );
}
