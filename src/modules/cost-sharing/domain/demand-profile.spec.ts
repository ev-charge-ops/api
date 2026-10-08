import {
  averageDailyPeakKw,
  peakDemand,
  peakDemandKw,
  percentOf,
  powerSteps,
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

describe('peakDemand', () => {
  it('tells when the highest simultaneous demand started', () => {
    expect(
      peakDemand([
        interval('19:00', '22:00', 7),
        interval('20:00', '21:00', 7),
        interval('20:30', '23:00', 22),
        interval('21:30', '22:30', 11),
      ]),
    ).toEqual({ demandKw: 40, at: at('21:30') });
  });

  it('keeps the first instant of a repeated peak', () => {
    expect(
      peakDemand([
        interval('19:00', '20:00', 7.4),
        interval('21:00', '22:00', 7.4),
      ]),
    ).toEqual({ demandKw: 7.4, at: at('19:00') });
  });

  it('has no instant without demand', () => {
    expect(peakDemand([])).toEqual({ demandKw: 0, at: null });
  });
});

describe('powerSteps', () => {
  it('follows the power of the readings and starts at the initial power', () => {
    expect(
      powerSteps({
        start: at('19:00'),
        end: at('20:00'),
        initialPowerKw: 7,
        readings: [
          { at: at('19:40'), powerKw: 4.2 },
          { at: at('19:20'), powerKw: 6.5 },
          { at: at('20:00'), powerKw: 0 },
          { at: at('18:00'), powerKw: 22 },
        ],
      }),
    ).toEqual([
      { start: at('19:00'), end: at('19:20'), powerKw: 7 },
      { start: at('19:20'), end: at('19:40'), powerKw: 6.5 },
      { start: at('19:40'), end: at('20:00'), powerKw: 4.2 },
    ]);
  });

  it('uses the initial power for the whole window without readings', () => {
    expect(
      powerSteps({
        start: at('19:00'),
        end: at('20:00'),
        initialPowerKw: 11,
        readings: [],
      }),
    ).toEqual([{ start: at('19:00'), end: at('20:00'), powerKw: 11 }]);
  });

  it('drops empty windows and steps without power', () => {
    expect(
      powerSteps({
        start: at('19:00'),
        end: at('19:00'),
        initialPowerKw: 7,
        readings: [],
      }),
    ).toEqual([]);
    expect(
      powerSteps({
        start: at('19:00'),
        end: at('20:00'),
        initialPowerKw: 0,
        readings: [{ at: at('19:30'), powerKw: 7 }],
      }),
    ).toEqual([{ start: at('19:30'), end: at('20:00'), powerKw: 7 }]);
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
