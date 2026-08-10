import { computeNextRunAt, pickRandomMessage, pickRandomTime, ScheduleForCalc } from './schedule-calculator';

function baseSchedule(overrides: Partial<ScheduleForCalc> = {}): ScheduleForCalc {
  return {
    recurrenceType: 'DAILY',
    cronExpression: null,
    intervalHours: null,
    intervalDays: null,
    daysOfWeek: [],
    timeOfDay: '09:00',
    timezone: 'UTC',
    randomTimeEnabled: false,
    randomWindowStart: null,
    randomWindowEnd: null,
    randomMinGapMinutes: null,
    randomMaxGapMinutes: null,
    avoidSameTimeAsLast: true,
    lastRunAt: null,
    startDate: null,
    expiryDate: null,
    ...overrides,
  };
}

describe('computeNextRunAt', () => {
  it('schedules DAILY for the same day if the time has not passed yet', () => {
    const from = new Date('2026-07-12T06:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ timeOfDay: '09:00' }), from);
    expect(next?.toISOString().slice(0, 10)).toBe('2026-07-12');
    expect(next?.getHours()).toBe(9);
  });

  it('rolls DAILY to the next day if the time has already passed', () => {
    const from = new Date('2026-07-12T12:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ timeOfDay: '09:00' }), from);
    expect(next?.toISOString().slice(0, 10)).toBe('2026-07-13');
  });

  it('only fires BUSINESS_DAYS on Mon-Fri', () => {
    // 2026-07-11 is a Saturday
    const from = new Date('2026-07-11T06:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ recurrenceType: 'BUSINESS_DAYS' }), from);
    expect(next && [1, 2, 3, 4, 5]).toContain(next?.getDay());
  });

  it('only fires WEEKENDS on Sat/Sun', () => {
    const from = new Date('2026-07-13T06:00:00.000Z'); // Monday
    const next = computeNextRunAt(baseSchedule({ recurrenceType: 'WEEKENDS' }), from);
    expect([0, 6]).toContain(next?.getDay());
  });

  it('respects EVERY_X_HOURS relative to the last run', () => {
    const lastRunAt = new Date('2026-07-12T06:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({ recurrenceType: 'EVERY_X_HOURS', intervalHours: 4, lastRunAt }),
      new Date('2026-07-12T06:05:00.000Z'),
    );
    expect(next?.toISOString()).toBe('2026-07-12T10:00:00.000Z');
  });

  it('returns null past the expiry date', () => {
    const from = new Date('2026-07-12T06:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({ timeOfDay: '09:00', expiryDate: new Date('2026-07-11T00:00:00.000Z') }),
      from,
    );
    expect(next).toBeNull();
  });

  it('only ever fires ONE_TIME once', () => {
    const from = new Date('2026-07-12T06:00:00.000Z');
    const fresh = computeNextRunAt(baseSchedule({ recurrenceType: 'ONE_TIME' }), from);
    expect(fresh).not.toBeNull();

    const alreadyRan = computeNextRunAt(
      baseSchedule({ recurrenceType: 'ONE_TIME', lastRunAt: from }),
      from,
    );
    expect(alreadyRan).toBeNull();
  });

  it('applies the random time window on top of the base recurrence day', () => {
    const from = new Date('2026-07-12T00:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({
        randomTimeEnabled: true,
        randomWindowStart: '09:00',
        randomWindowEnd: '12:00',
      }),
      from,
    );
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBeGreaterThanOrEqual(9);
    expect(next!.getHours()).toBeLessThanOrEqual(12);
  });
});

describe('pickRandomTime', () => {
  it('always lands within [windowStart, windowEnd]', () => {
    const base = new Date('2026-07-12T00:00:00.000Z');
    for (let i = 0; i < 50; i++) {
      const t = pickRandomTime(base, '09:00', '12:00', {});
      const minutesOfDay = t.getHours() * 60 + t.getMinutes();
      expect(minutesOfDay).toBeGreaterThanOrEqual(9 * 60);
      expect(minutesOfDay).toBeLessThanOrEqual(12 * 60);
    }
  });

  it('enforces the minimum gap from the last run', () => {
    const base = new Date('2026-07-12T00:00:00.000Z');
    const lastRunAt = new Date('2026-07-12T09:05:00.000Z');
    const t = pickRandomTime(base, '09:00', '09:10', {
      minGapMinutes: 30,
      lastRunAt,
    });
    const gap = (t.getTime() - lastRunAt.getTime()) / 60_000;
    expect(gap).toBeGreaterThanOrEqual(30);
  });
});

describe('pickRandomMessage', () => {
  it('returns null for an empty pool', () => {
    expect(pickRandomMessage([])).toBeNull();
  });

  it('always returns an item from the pool', () => {
    const pool = ['Good Morning ☀️', 'Have a Great Day ❤️', 'Stay Positive 💪'];
    for (let i = 0; i < 20; i++) {
      expect(pool).toContain(pickRandomMessage(pool));
    }
  });
});
