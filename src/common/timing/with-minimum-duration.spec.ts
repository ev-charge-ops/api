import { withMinimumDuration } from './with-minimum-duration.js';

describe('withMinimumDuration', () => {
  it('waits at least the minimum duration for fast work', async () => {
    const startedAt = performance.now();

    await expect(
      withMinimumDuration(Promise.resolve('done'), 50),
    ).resolves.toBe('done');

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(45);
  });

  it('does not add delay beyond slow work', async () => {
    const slowWork = new Promise((resolve) => setTimeout(resolve, 80, 'slow'));
    const startedAt = performance.now();

    await expect(withMinimumDuration(slowWork, 10)).resolves.toBe('slow');

    expect(performance.now() - startedAt).toBeLessThan(200);
  });

  it('propagates failures', async () => {
    await expect(
      withMinimumDuration(Promise.reject(new Error('boom')), 1),
    ).rejects.toThrow('boom');
  });
});
