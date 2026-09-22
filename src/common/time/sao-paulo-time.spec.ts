import { toSaoPauloTime } from './sao-paulo-time.js';

describe('toSaoPauloTime', () => {
  it('converts UTC instants to the local wall clock', () => {
    expect(toSaoPauloTime(new Date('2026-10-07T01:30:00Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 6,
      hour: 22,
      minute: 30,
      dayOfWeek: 2,
    });
  });

  it('keeps midnight as hour zero', () => {
    expect(toSaoPauloTime(new Date('2026-10-07T03:00:00Z')).hour).toBe(0);
  });
});
