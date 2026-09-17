export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

const SWEEP_THRESHOLD = 10_000;

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, limit: number, ttlMs: number): RateLimitResult {
    const now = this.now();
    this.sweepIfLarge(now);

    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + ttlMs };
      this.windows.set(key, window);
    }
    window.count += 1;

    return {
      allowed: window.count <= limit,
      remaining: Math.max(limit - window.count, 0),
      retryAfterSeconds: Math.ceil((window.resetAt - now) / 1000),
    };
  }

  get size(): number {
    return this.windows.size;
  }

  private sweepIfLarge(now: number): void {
    if (this.windows.size < SWEEP_THRESHOLD) {
      return;
    }
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
