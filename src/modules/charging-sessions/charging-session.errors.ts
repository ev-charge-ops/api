import { HttpException, HttpStatus } from '@nestjs/common';

export const SessionErrorCode = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_ENDED: 'SESSION_ALREADY_ENDED',
  CHARGE_POINT_OFFLINE: 'CHARGE_POINT_OFFLINE',
  CHARGE_POINT_BUSY: 'CHARGE_POINT_BUSY',
  ACTIVE_SESSION_EXISTS: 'ACTIVE_SESSION_EXISTS',
  TARIFF_NOT_CONFIGURED: 'TARIFF_NOT_CONFIGURED',
  BUILDING_CAPACITY_EXCEEDED: 'BUILDING_CAPACITY_EXCEEDED',
  INVALID_LIMIT: 'INVALID_LIMIT',
  CHARGER_UNAVAILABLE: 'CHARGER_UNAVAILABLE',
} as const;

export type SessionErrorCode =
  (typeof SessionErrorCode)[keyof typeof SessionErrorCode];

const ERROR_NAMES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
};

export function sessionError(
  status: HttpStatus,
  code: SessionErrorCode,
  message: string,
): HttpException {
  return new HttpException(
    { statusCode: status, error: ERROR_NAMES[status], message, code },
    status,
  );
}

export function sessionNotFound(): HttpException {
  return sessionError(
    HttpStatus.NOT_FOUND,
    SessionErrorCode.SESSION_NOT_FOUND,
    'Session not found',
  );
}

export function sessionConflict(
  code: SessionErrorCode,
  message: string,
): HttpException {
  return sessionError(HttpStatus.CONFLICT, code, message);
}
