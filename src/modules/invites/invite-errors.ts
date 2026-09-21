import { HttpException, HttpStatus } from '@nestjs/common';
import { InviteStatus } from './invite-status.js';

export const InviteErrorCode = {
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_REVOKED: 'INVITE_REVOKED',
  INVITE_ALREADY_ACCEPTED: 'INVITE_ALREADY_ACCEPTED',
  INVITE_ALREADY_PENDING: 'INVITE_ALREADY_PENDING',
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
} as const;

export type InviteErrorCode =
  (typeof InviteErrorCode)[keyof typeof InviteErrorCode];

const ERROR_NAMES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.GONE]: 'Gone',
};

export function inviteError(
  status: HttpStatus,
  code: InviteErrorCode,
  message: string,
): HttpException {
  return new HttpException(
    { statusCode: status, error: ERROR_NAMES[status], message, code },
    status,
  );
}

export function inviteNotFound(): HttpException {
  return inviteError(
    HttpStatus.NOT_FOUND,
    InviteErrorCode.INVITE_NOT_FOUND,
    'Invite not found',
  );
}

export function inviteUnavailable(
  status: Exclude<InviteStatus, 'PENDING'>,
  httpStatus: HttpStatus.GONE | HttpStatus.CONFLICT = HttpStatus.GONE,
): HttpException {
  switch (status) {
    case InviteStatus.EXPIRED:
      return inviteError(
        httpStatus,
        InviteErrorCode.INVITE_EXPIRED,
        'Invite has expired',
      );
    case InviteStatus.REVOKED:
      return inviteError(
        httpStatus,
        InviteErrorCode.INVITE_REVOKED,
        'Invite has been revoked',
      );
    case InviteStatus.ACCEPTED:
      return inviteError(
        httpStatus,
        InviteErrorCode.INVITE_ALREADY_ACCEPTED,
        'Invite has already been accepted',
      );
  }
}
