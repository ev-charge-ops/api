import { createOriginMatcher } from './cors-origin.js';

describe('createOriginMatcher', () => {
  const matches = createOriginMatcher([
    'http://localhost:5173',
    'https://ev-charge-ops-web-*-rodrigogmdias-projects.vercel.app',
  ]);

  it('accepts exact origins', () => {
    expect(matches('http://localhost:5173')).toBe(true);
  });

  it('accepts origins matching a wildcard pattern', () => {
    expect(
      matches(
        'https://ev-charge-ops-web-git-feat-login-rodrigogmdias-projects.vercel.app',
      ),
    ).toBe(true);
  });

  it('rejects origins outside the list', () => {
    expect(matches('http://localhost:3000')).toBe(false);
    expect(matches('https://evil.example.com')).toBe(false);
  });

  it('does not let the wildcard cross path or host boundaries', () => {
    expect(
      matches(
        'https://ev-charge-ops-web-x.evil.com/-rodrigogmdias-projects.vercel.app',
      ),
    ).toBe(false);
    expect(
      matches(
        'https://ev-charge-ops-web-x-rodrigogmdias-projects.vercel.app.evil.com',
      ),
    ).toBe(false);
  });

  it('treats dots literally', () => {
    expect(matches('http://localhostx5173')).toBe(false);
  });

  it('rejects everything when no patterns are configured', () => {
    expect(createOriginMatcher([])('http://localhost:5173')).toBe(false);
  });
});
