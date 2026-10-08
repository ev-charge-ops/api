import { HttpException, HttpStatus } from '@nestjs/common';

export const PrivacyErrorCode = {
  REQUIRED_CONSENT: 'REQUIRED_CONSENT',
  TERMS_VERSION_OUTDATED: 'TERMS_VERSION_OUTDATED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  LAST_MANAGER: 'LAST_MANAGER',
} as const;

export type PrivacyErrorCode =
  (typeof PrivacyErrorCode)[keyof typeof PrivacyErrorCode];

const ERROR_NAMES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.CONFLICT]: 'Conflict',
};

export function privacyError(
  status: HttpStatus,
  code: PrivacyErrorCode,
  message: string,
): HttpException {
  return new HttpException(
    { statusCode: status, error: ERROR_NAMES[status], message, code },
    status,
  );
}
