export type OriginMatcher = (origin: string) => boolean;

export function createOriginMatcher(patterns: string[]): OriginMatcher {
  const matchers = patterns.map(toRegExp);
  return (origin) => matchers.some((matcher) => matcher.test(origin));
}

function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/.]*');
  return new RegExp(`^${source}$`);
}
