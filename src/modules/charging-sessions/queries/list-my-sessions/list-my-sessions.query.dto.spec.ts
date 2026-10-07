import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMySessionsQueryDto } from './list-my-sessions.query.dto.js';

async function errorsFor(query: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(
    plainToInstance(ListMySessionsQueryDto, query),
    {
      whitelist: true,
      forbidNonWhitelisted: true,
    },
  );
  return errors.map((error) => error.property).sort();
}

describe('ListMySessionsQueryDto', () => {
  it('accepts the pagination without a month', async () => {
    await expect(errorsFor({ page: '2', pageSize: '10' })).resolves.toEqual([]);
  });

  it('accepts a calendar month', async () => {
    await expect(errorsFor({ month: '2026-10' })).resolves.toEqual([]);
  });

  it('rejects malformed months', async () => {
    for (const month of ['2026-13', '2026-1', '10-2026', '2026-10-01']) {
      await expect(errorsFor({ month })).resolves.toEqual(['month']);
    }
  });
});
