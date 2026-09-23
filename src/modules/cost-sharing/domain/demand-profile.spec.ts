import {
  averageDailyPeakKw,
  peakDemandKw,
  percentOf,
} from './demand-profile.js';

const at = (time: string) => new Date(`2026-08-10T${time}:00-03:00`);

function interval(
  start: string,
  end: string,
  powerKw: number,
  dayKey = '2026-08-10',
) {
  return { start: at(start), end: at(end), powerKw, dayKey };
}

describe('peakDemandKw', () => {
  it('adds overlapping sessions', () => {
    expect(
      peakDemandKw([
        interval('19:00', '22:00', 7),
        interval('20:00', '21:00', 7),
        interval('20:30', '23:00', 22),
      ]),
    ).toBe(36);
  });

  it('does not add a session that starts when another ends', () => {
    expect(
      peakDemandKw([
        interval('19:00', '20:00', 7),
        interval('20:00', '21:00', 11),
      ]),
    ).toBe(11);
  });

  it('is zero without sessions', () => {
    expect(peakDemandKw([])).toBe(0);
  });
});

describe('averageDailyPeakKw', () => {
  it('averages the peak of each day with sessions', () => {
    expect(
      averageDailyPeakKw([
        interval('19:00', '22:00', 7, 'a'),
        interval('20:00', '21:00', 7, 'a'),
        interval('08:00', '09:00', 22, 'b'),
        interval('10:00', '11:00', 7, 'c'),
      ]),
    ).toBe(14.33);
  });
});

describe('percentOf', () => {
  it('rounds to one decimal and guards against zero', () => {
    expect(percentOf(14, 75)).toBe(18.7);
    expect(percentOf(1, 0)).toBe(0);
  });
});
