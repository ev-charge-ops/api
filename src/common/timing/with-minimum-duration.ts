import { setTimeout as sleep } from 'node:timers/promises';

export async function withMinimumDuration<T>(
  work: Promise<T>,
  minimumMs: number,
): Promise<T> {
  const [result] = await Promise.all([work, sleep(minimumMs)]);
  return result;
}
