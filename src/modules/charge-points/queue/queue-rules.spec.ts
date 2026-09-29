import {
  applyPlan,
  isActiveEntry,
  planAdvance,
  type QueueEntryRecord,
  reservationEnd,
  summarize,
} from './queue-rules.js';

const NOW = new Date('2026-10-07T22:00:00.000Z');

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

function entry(
  id: string,
  overrides: Partial<QueueEntryRecord> = {},
): QueueEntryRecord {
  return {
    id,
    chargePointId: 'point-1',
    userId: `user-${id}`,
    status: 'WAITING',
    reservedUntil: null,
    notifiedAt: null,
    endedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('queue rules', () => {
  it('reserves the point for 10 minutes', () => {
    expect(reservationEnd(NOW)).toEqual(minutesFromNow(10));
  });

  it('treats waiting and notified entries as active', () => {
    expect(isActiveEntry({ status: 'WAITING' })).toBe(true);
    expect(isActiveEntry({ status: 'NOTIFIED' })).toBe(true);
    expect(isActiveEntry({ status: 'EXPIRED' })).toBe(false);
    expect(isActiveEntry({ status: 'LEFT' })).toBe(false);
    expect(isActiveEntry({ status: 'FULFILLED' })).toBe(false);
  });

  it('promotes the head only when the point is available', () => {
    const entries = [entry('a'), entry('b')];

    expect(planAdvance(entries, false, NOW)).toEqual({
      expiredIds: [],
      promoteId: null,
    });
    expect(planAdvance(entries, true, NOW)).toEqual({
      expiredIds: [],
      promoteId: 'a',
    });
  });

  it('keeps a running reservation', () => {
    const entries = [
      entry('a', { status: 'NOTIFIED', reservedUntil: minutesFromNow(1) }),
      entry('b'),
    ];

    expect(planAdvance(entries, true, NOW)).toEqual({
      expiredIds: [],
      promoteId: null,
    });
  });

  it('expires a lapsed reservation and moves to the next person', () => {
    const entries = [
      entry('a', { status: 'NOTIFIED', reservedUntil: NOW }),
      entry('b'),
      entry('c'),
    ];

    const plan = planAdvance(entries, true, NOW);
    expect(plan).toEqual({ expiredIds: ['a'], promoteId: 'b' });

    const promoted = entry('b', {
      status: 'NOTIFIED',
      reservedUntil: minutesFromNow(10),
    });
    const after = applyPlan(entries, plan, promoted);
    expect(after.map((item) => [item.id, item.status])).toEqual([
      ['b', 'NOTIFIED'],
      ['c', 'WAITING'],
    ]);
    expect(summarize(after, 'user-c')).toEqual({
      queueLength: 2,
      reservedUntil: minutesFromNow(10),
      reservedForUserId: 'user-b',
      myEntry: after[1],
      myPosition: 2,
    });
  });

  it('expires a lapsed reservation without promoting while the point is busy', () => {
    const entries = [
      entry('a', { status: 'NOTIFIED', reservedUntil: minutesFromNow(-1) }),
      entry('b'),
    ];

    expect(planAdvance(entries, false, NOW)).toEqual({
      expiredIds: ['a'],
      promoteId: null,
    });
  });

  it('summarizes an empty queue for someone outside it', () => {
    expect(summarize([entry('a')], 'user-z')).toEqual({
      queueLength: 1,
      reservedUntil: null,
      reservedForUserId: null,
      myEntry: null,
      myPosition: null,
    });
  });
});
