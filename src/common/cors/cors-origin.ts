import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

export type OriginMatcher = (origin: string) => boolean;

export const EXPOSED_RESPONSE_HEADERS = ['Content-Disposition'];

export function createOriginMatcher(patterns: string[]): OriginMatcher {
  const matchers = patterns.map(toRegExp);
  return (origin) => matchers.some((matcher) => matcher.test(origin));
}

export function createCorsOptions(patterns: string[]): CorsOptions {
  const isAllowedOrigin = createOriginMatcher(patterns);
  return {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || isAllowedOrigin(origin)),
    exposedHeaders: EXPOSED_RESPONSE_HEADERS,
  };
}

function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/.]*');
  return new RegExp(`^${source}$`);
}
