import {
  formatMonth,
  saoPauloDate,
  saoPauloMonth,
  saoPauloMonthOf,
  toSaoPauloTime,
} from './sao-paulo-time.js';

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

describe('saoPauloMonth', () => {
  it('spans the local calendar month', () => {
    expect(saoPauloMonth(2026, 8)).toEqual({
      year: 2026,
      month: 8,
      start: new Date('2026-08-01T03:00:00.000Z'),
      end: new Date('2026-09-01T03:00:00.000Z'),
    });
  });

  it('rolls over to the next year in December', () => {
    expect(saoPauloMonth(2026, 12).end).toEqual(
      new Date('2027-01-01T03:00:00.000Z'),
    );
  });

  it('finds the local month of an instant', () => {
    const range = saoPauloMonthOf(new Date('2026-09-01T02:30:00.000Z'));
    expect(formatMonth(range)).toBe('2026-08');
  });

  it('builds local wall clock instants', () => {
    expect(saoPauloDate(2026, 10, 7, 19, 30)).toEqual(
      new Date('2026-10-07T22:30:00.000Z'),
    );
  });
});
