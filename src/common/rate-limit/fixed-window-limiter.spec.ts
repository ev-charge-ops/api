import { FixedWindowLimiter } from './fixed-window-limiter.js';

describe('FixedWindowLimiter', () => {
  let now: number;
  let limiter: FixedWindowLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new FixedWindowLimiter(() => now);
  });

  it('allows requests up to the limit within the window', () => {
    expect(limiter.hit('key', 2, 60_000)).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 60,
    });
    expect(limiter.hit('key', 2, 60_000).allowed).toBe(true);

    now += 15_000;
    expect(limiter.hit('key', 2, 60_000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
    });
  });

  it('starts a new window after the ttl', () => {
    limiter.hit('key', 1, 60_000);
    expect(limiter.hit('key', 1, 60_000).allowed).toBe(false);

    now += 60_000;
    expect(limiter.hit('key', 1, 60_000).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    limiter.hit('a', 1, 60_000);

    expect(limiter.hit('b', 1, 60_000).allowed).toBe(true);
    expect(limiter.hit('a', 1, 60_000).allowed).toBe(false);
  });

  it('evicts expired windows once the map grows large', () => {
    for (let index = 0; index < 10_000; index += 1) {
      limiter.hit(`key-${index}`, 1, 1_000);
    }
    now += 1_000;

    limiter.hit('fresh', 1, 1_000);

    expect(limiter.size).toBe(1);
  });
});
