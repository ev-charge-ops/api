import { HttpException, HttpStatus } from '@nestjs/common';

export const AccountErrorCode = {
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
} as const;

export type AccountErrorCode =
  (typeof AccountErrorCode)[keyof typeof AccountErrorCode];

export function invalidCurrentPassword(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'The current password is missing or incorrect',
      code: AccountErrorCode.INVALID_CURRENT_PASSWORD,
    },
    HttpStatus.BAD_REQUEST,
  );
}
