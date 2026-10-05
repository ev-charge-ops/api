import { HttpException, HttpStatus } from '@nestjs/common';
import { PaymentsUnavailableError } from '../payments/payment-gateway.port.js';

export const SessionErrorCode = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_ENDED: 'SESSION_ALREADY_ENDED',
  CHARGE_POINT_OFFLINE: 'CHARGE_POINT_OFFLINE',
  CHARGE_POINT_BUSY: 'CHARGE_POINT_BUSY',
  CHARGE_POINT_RESERVED: 'CHARGE_POINT_RESERVED',
  ACTIVE_SESSION_EXISTS: 'ACTIVE_SESSION_EXISTS',
  TARIFF_NOT_CONFIGURED: 'TARIFF_NOT_CONFIGURED',
  BUILDING_CAPACITY_EXCEEDED: 'BUILDING_CAPACITY_EXCEEDED',
  INVALID_LIMIT: 'INVALID_LIMIT',
  CHARGER_UNAVAILABLE: 'CHARGER_UNAVAILABLE',
  PAYMENTS_UNAVAILABLE: 'PAYMENTS_UNAVAILABLE',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
  PAYMENT_NOT_REQUIRED: 'PAYMENT_NOT_REQUIRED',
  PAYMENT_NOT_PENDING: 'PAYMENT_NOT_PENDING',
  INVALID_WEBHOOK_SIGNATURE: 'INVALID_WEBHOOK_SIGNATURE',
  SESSION_NOT_FLAGGED: 'SESSION_NOT_FLAGGED',
} as const;

export type SessionErrorCode =
  (typeof SessionErrorCode)[keyof typeof SessionErrorCode];

const ERROR_NAMES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
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

export function paymentsUnavailable(): HttpException {
  return sessionError(
    HttpStatus.SERVICE_UNAVAILABLE,
    SessionErrorCode.PAYMENTS_UNAVAILABLE,
    'Card payments are not configured',
  );
}

export function paymentProviderError(error: unknown): HttpException {
  if (error instanceof PaymentsUnavailableError) {
    return paymentsUnavailable();
  }
  return sessionError(
    HttpStatus.BAD_GATEWAY,
    SessionErrorCode.PAYMENT_PROVIDER_ERROR,
    'The payment provider did not respond, try again',
  );
}
