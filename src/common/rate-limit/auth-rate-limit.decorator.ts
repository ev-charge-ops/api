import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';

export const AUTH_RATE_LIMIT_KEY = 'authRateLimit';

export const AuthRateLimit = () =>
  applyDecorators(
    SetMetadata(AUTH_RATE_LIMIT_KEY, true),
    ApiTooManyRequestsResponse({ description: 'Too many requests' }),
  );
