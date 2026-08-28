import {
  computeNextRunAt,
  pickRandomMessage,
  pickRandomTime,
  ScheduleForCalc,
  SchedulingConflictError,
} from './schedule-calculator';

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

// ---------------------------------------------------------------------------
// Original coverage, preserved. These all use timezone: 'UTC' (the
// baseSchedule default), so they exercise the same wall-clock-equals-UTC
// case the pre-Phase-C implementation only ever got right — expected values
// are unchanged from before this phase.
// ---------------------------------------------------------------------------

describe('computeNextRunAt — existing coverage (UTC)', () => {
  it('schedules DAILY for the same day if the time has not passed yet', () => {
    const from = new Date('2026-07-12T06:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ timeOfDay: '09:00' }), from);
    expect(next?.toISOString()).toBe('2026-07-12T09:00:00.000Z');
  });

  it('rolls DAILY to the next day if the time has already passed', () => {
    const from = new Date('2026-07-12T12:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ timeOfDay: '09:00' }), from);
    expect(next?.toISOString()).toBe('2026-07-13T09:00:00.000Z');
  });

  it('only fires BUSINESS_DAYS on Mon-Fri', () => {
    // 2026-07-11 is a Saturday
    const from = new Date('2026-07-11T06:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ recurrenceType: 'BUSINESS_DAYS' }), from);
    expect(next && [1, 2, 3, 4, 5]).toContain(next?.getUTCDay());
  });

  it('only fires WEEKENDS on Sat/Sun', () => {
    const from = new Date('2026-07-13T06:00:00.000Z'); // Monday
    const next = computeNextRunAt(baseSchedule({ recurrenceType: 'WEEKENDS' }), from);
    expect([0, 6]).toContain(next?.getUTCDay());
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

    const alreadyRan = computeNextRunAt(baseSchedule({ recurrenceType: 'ONE_TIME', lastRunAt: from }), from);
    expect(alreadyRan).toBeNull();
  });

  it('applies the random time window on top of the base recurrence day', () => {
    const from = new Date('2026-07-12T00:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({ randomTimeEnabled: true, randomWindowStart: '09:00', randomWindowEnd: '12:00' }),
      from,
    );
    expect(next).not.toBeNull();
    expect(next!.getUTCHours()).toBeGreaterThanOrEqual(9);
    expect(next!.getUTCHours()).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// Phase C: timezone correctness
//
// Expected values below were independently verified against cron-parser and
// Intl.DateTimeFormat directly (outside this module) before being written
// into assertions — they are not "whatever the code currently outputs".
// ---------------------------------------------------------------------------

describe('computeNextRunAt — timezone correctness', () => {
  it('Daily 09:00 Asia/Kolkata → correct UTC execution (IST is UTC+5:30)', () => {
    const from = new Date('2026-07-12T00:00:00.000Z');
    const next = computeNextRunAt(baseSchedule({ timezone: 'Asia/Kolkata' }), from);
    expect(next?.toISOString()).toBe('2026-07-12T03:30:00.000Z');
  });

  it('Daily 09:00 America/New_York → correct UTC execution (EST is UTC-5, outside DST)', () => {
    const from = new Date('2026-03-07T00:00:00.000Z'); // before that year's DST start
    const next = computeNextRunAt(baseSchedule({ timezone: 'America/New_York' }), from);
    expect(next?.toISOString()).toBe('2026-03-07T14:00:00.000Z'); // 09:00 EST = 14:00 UTC
  });

  it('Weekly schedule respects the local weekday/time, not the server weekday', () => {
    // 2026-07-13 is a Monday. Requesting Wednesday (3) at 09:00 IST from a
    // Monday must land on the *local* Wednesday, still expressed correctly
    // as its UTC instant.
    const from = new Date('2026-07-13T00:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({ recurrenceType: 'WEEKLY', timezone: 'Asia/Kolkata', daysOfWeek: [3] }),
      from,
    );
    expect(next?.toISOString()).toBe('2026-07-15T03:30:00.000Z');
  });

  it('Monthly schedule respects the local date/time', () => {
    // Anchored on the 15th via startDate; asking from the 20th must roll to
    // the 15th of the *next* month, at 09:00 IST.
    const from = new Date('2026-07-20T00:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({
        recurrenceType: 'MONTHLY',
        timezone: 'Asia/Kolkata',
        startDate: new Date('2026-01-15T00:00:00.000Z'),
      }),
      from,
    );
    expect(next?.toISOString()).toBe('2026-08-15T03:30:00.000Z');
  });

  it('Yearly schedule respects the local date/time', () => {
    // Anchored on Aug 15 (any year, only month/day is used); asking from
    // July 20 2026 must land on Aug 15 2026, at 09:00 IST — same year,
    // since the anniversary hasn't happened yet.
    const from = new Date('2026-07-20T00:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({
        recurrenceType: 'YEARLY',
        timezone: 'Asia/Kolkata',
        startDate: new Date('2020-08-15T00:00:00.000Z'),
      }),
      from,
    );
    expect(next?.toISOString()).toBe('2026-08-15T03:30:00.000Z');
  });

  it('EVERY_X_DAYS advances by civil calendar days in the schedule zone, not raw hours', () => {
    // Anchor: 2026-07-12T09:00 IST (03:30 UTC). +2 days -> 2026-07-14T09:00
    // IST, still 09:00 local even though the raw UTC offset is identical
    // here (Kolkata has no DST) — the meaningful assertion is that this
    // matches the *civil date* step, verified against DST zones below.
    const lastRunAt = new Date('2026-07-12T03:30:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({
        recurrenceType: 'EVERY_X_DAYS',
        timezone: 'Asia/Kolkata',
        intervalDays: 2,
        lastRunAt,
      }),
      new Date('2026-07-12T04:00:00.000Z'),
    );
    expect(next?.toISOString()).toBe('2026-07-14T03:30:00.000Z');
  });

  it('EVERY_X_DAYS across a DST boundary keeps the local time-of-day fixed, not the UTC offset', () => {
    // Anchor: 2026-10-30, 09:00 America/New_York, while still EDT
    // (UTC-4) -> 2026-10-30T13:00:00Z. Stepping +3 days crosses DST end
    // (2026-11-01) into EST (UTC-5). The local wall-clock time must still
    // read 09:00 on Nov 2 — its UTC instant should shift by an extra hour
    // relative to a naive "+3*24h", not stay at the same UTC offset.
    const lastRunAt = new Date('2026-10-30T13:00:00.000Z'); // 09:00 EDT
    const next = computeNextRunAt(
      baseSchedule({
        recurrenceType: 'EVERY_X_DAYS',
        timezone: 'America/New_York',
        intervalDays: 3,
        lastRunAt,
      }),
      new Date('2026-10-30T14:00:00.000Z'),
    );
    // 09:00 EST (UTC-5) on Nov 2, not 13:00 UTC (which would be the naive,
    // DST-ignorant answer).
    expect(next?.toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('CUSTOM_CRON still resolves in the schedule timezone (unchanged from before this phase)', () => {
    const from = new Date('2026-07-12T00:00:00.000Z');
    const next = computeNextRunAt(
      baseSchedule({ recurrenceType: 'CUSTOM_CRON', cronExpression: '0 9 * * *', timezone: 'Asia/Kolkata' }),
      from,
    );
    expect(next?.toISOString()).toBe('2026-07-12T03:30:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Phase C: DST transitions specifically
// (US 2026 DST: starts Sun 2026-03-08, ends Sun 2026-11-01)
// ---------------------------------------------------------------------------

describe('computeNextRunAt — DST transitions', () => {
  const dailyNy = (from: Date) => computeNextRunAt(baseSchedule({ timezone: 'America/New_York' }), from);

  it('a normal day (no transition nearby) computes the expected offset', () => {
    // Mid-July, well inside EDT (UTC-4).
    const next = dailyNy(new Date('2026-07-01T00:00:00.000Z'));
    expect(next?.toISOString()).toBe('2026-07-01T13:00:00.000Z'); // 09:00 EDT
  });

  it('DST start (spring forward, 2026-03-08): 09:00 local becomes 13:00 UTC, not 14:00', () => {
    const beforeTransition = dailyNy(new Date('2026-03-07T00:00:00.000Z'));
    expect(beforeTransition?.toISOString()).toBe('2026-03-07T14:00:00.000Z'); // still EST (UTC-5)

    const onTransitionDay = dailyNy(new Date('2026-03-08T00:00:00.000Z'));
    expect(onTransitionDay?.toISOString()).toBe('2026-03-08T13:00:00.000Z'); // now EDT (UTC-4)

    // The wall-clock hour is identical (9 AM) on both sides of the
    // transition — only the UTC instant shifts, by exactly one hour.
    expect(onTransitionDay!.getTime() - beforeTransition!.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('DST end (fall back, 2026-11-01): offset reverts from EDT to EST correctly', () => {
    const beforeTransition = dailyNy(new Date('2026-10-31T00:00:00.000Z'));
    expect(beforeTransition?.toISOString()).toBe('2026-10-31T13:00:00.000Z'); // EDT (UTC-4)

    const onTransitionDay = dailyNy(new Date('2026-11-01T00:00:00.000Z'));
    expect(onTransitionDay?.toISOString()).toBe('2026-11-01T14:00:00.000Z'); // EST (UTC-5)

    const afterTransition = dailyNy(new Date('2026-11-02T00:00:00.000Z'));
    expect(afterTransition?.toISOString()).toBe('2026-11-02T14:00:00.000Z'); // still EST

    // Wall-clock time unchanged (9 AM); the day-over-day UTC gap widens by
    // an hour across the fall-back transition.
    expect(onTransitionDay!.getTime() - beforeTransition!.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('a zone with no DST at all (Asia/Kolkata) has a constant offset year-round', () => {
    const winter = computeNextRunAt(baseSchedule({ timezone: 'Asia/Kolkata' }), new Date('2026-01-10T00:00:00.000Z'));
    const summer = computeNextRunAt(baseSchedule({ timezone: 'Asia/Kolkata' }), new Date('2026-07-10T00:00:00.000Z'));
    // Both must be exactly 09:00 IST = 03:30 UTC, regardless of season.
    expect(winter?.toISOString().slice(11, 16)).toBe('03:30');
    expect(summer?.toISOString().slice(11, 16)).toBe('03:30');
  });
});

// ---------------------------------------------------------------------------
// Phase C: random time window
// ---------------------------------------------------------------------------

describe('pickRandomTime', () => {
  it('always lands within [windowStart, windowEnd] in UTC (backward-compatible case)', () => {
    const base = new Date('2026-07-12T00:00:00.000Z');
    for (let i = 0; i < 50; i++) {
      const t = pickRandomTime(base, '09:00', '12:00', 'UTC');
      const minutesOfDay = t.getUTCHours() * 60 + t.getUTCMinutes();
      expect(minutesOfDay).toBeGreaterThanOrEqual(9 * 60);
      expect(minutesOfDay).toBeLessThanOrEqual(12 * 60);
    }
  });

  it('random 09:00-12:00 stays inside the requested LOCAL window after timezone conversion (Asia/Kolkata)', () => {
    const base = new Date('2026-07-12T00:00:00.000Z');
    const windowStartUtc = new Date('2026-07-12T03:30:00.000Z').getTime(); // 09:00 IST
    const windowEndUtc = new Date('2026-07-12T06:30:00.000Z').getTime(); // 12:00 IST

    for (let i = 0; i < 50; i++) {
      const t = pickRandomTime(base, '09:00', '12:00', 'Asia/Kolkata');
      expect(t.getTime()).toBeGreaterThanOrEqual(windowStartUtc);
      expect(t.getTime()).toBeLessThanOrEqual(windowEndUtc);
    }
  });

  it('random window stays correct across a DST boundary date (America/New_York)', () => {
    // 2026-03-08 is DST start day; 09:00-12:00 local must map to
    // 13:00-16:00 UTC (EDT, UTC-4), not 14:00-17:00 (the pre-transition
    // EST offset). `base` is deliberately noon UTC (08:00 EST that
    // morning), not UTC midnight — UTC midnight on the 8th is still
    // 19:00 on the 7th in New York, which would exercise the wrong
    // calendar day entirely.
    const base = new Date('2026-03-08T12:00:00.000Z');
    const windowStartUtc = new Date('2026-03-08T13:00:00.000Z').getTime();
    const windowEndUtc = new Date('2026-03-08T16:00:00.000Z').getTime();

    for (let i = 0; i < 30; i++) {
      const t = pickRandomTime(base, '09:00', '12:00', 'America/New_York');
      expect(t.getTime()).toBeGreaterThanOrEqual(windowStartUtc);
      expect(t.getTime()).toBeLessThanOrEqual(windowEndUtc);
    }
  });

  it('enforces the minimum gap from the last run when the window allows it', () => {
    // Widened window vs. the old test so the constraint is actually
    // satisfiable — see "throws when constraints leave no valid
    // candidate" below for the case where it isn't.
    const base = new Date('2026-07-12T00:00:00.000Z');
    const lastRunAt = new Date('2026-07-12T09:05:00.000Z');
    for (let i = 0; i < 20; i++) {
      const t = pickRandomTime(base, '09:00', '11:00', 'UTC', { minGapMinutes: 30, lastRunAt });
      const gap = (t.getTime() - lastRunAt.getTime()) / 60_000;
      expect(gap).toBeGreaterThanOrEqual(30);
    }
  });

  it('enforces the maximum gap from the last run when the window allows it', () => {
    const base = new Date('2026-07-12T00:00:00.000Z');
    const lastRunAt = new Date('2026-07-12T09:00:00.000Z');
    for (let i = 0; i < 20; i++) {
      const t = pickRandomTime(base, '09:00', '11:00', 'UTC', { maxGapMinutes: 45, lastRunAt });
      const gap = (t.getTime() - lastRunAt.getTime()) / 60_000;
      expect(gap).toBeLessThanOrEqual(45);
    }
  });

  it('throws SchedulingConflictError when the window and min-gap have no overlap, instead of picking a time outside the window', () => {
    // Window is only 09:00-09:10; a 30-minute minimum gap from a 09:05 last
    // run pushes the earliest valid time to 09:35 — past the window. The
    // old implementation used to silently clamp to 09:35 anyway, which is
    // exactly the "repair into the window" bug this phase removes.
    const base = new Date('2026-07-12T00:00:00.000Z');
    const lastRunAt = new Date('2026-07-12T09:05:00.000Z');

    expect(() =>
      pickRandomTime(base, '09:00', '09:10', 'UTC', { minGapMinutes: 30, lastRunAt }),
    ).toThrow(SchedulingConflictError);
  });

  it('a schedule whose window+gap conflict surfaces the same error through computeNextRunAt', () => {
    const from = new Date('2026-07-12T00:00:00.000Z');
    const schedule = baseSchedule({
      randomTimeEnabled: true,
      randomWindowStart: '09:00',
      randomWindowEnd: '09:10',
      randomMinGapMinutes: 30,
      lastRunAt: new Date('2026-07-12T09:05:00.000Z'),
    });

    expect(() => computeNextRunAt(schedule, from)).toThrow(SchedulingConflictError);
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

// ---------------------------------------------------------------------------
// Phase C: pause/resume still works
//
// pause/resume itself is a service-layer concern (SchedulesService.setStatus
// only recomputes nextRunAt when resuming to ACTIVE — see
// schedules.service.ts), but the calculator-level contract it depends on is
// that computeNextRunAt keeps working the same way on a freshly-resumed
// schedule as on a newly-created one, including across a timezone. That
// contract is what's verified here without needing a database.
// ---------------------------------------------------------------------------

describe('computeNextRunAt — pause/resume contract', () => {
  it('a resumed schedule (no lastRunAt change) recomputes the same way as before pausing', () => {
    const from = new Date('2026-07-12T00:00:00.000Z');
    const schedule = baseSchedule({ timezone: 'Asia/Kolkata', timeOfDay: '09:00' });

    const beforePause = computeNextRunAt(schedule, from);
    // Pausing doesn't change any of the fields computeNextRunAt reads, so
    // resuming (re-running the same computation) must be deterministic.
    const afterResume = computeNextRunAt(schedule, from);

    expect(afterResume?.toISOString()).toBe(beforePause?.toISOString());
  });

  it('a schedule with a lastRunAt from before it was paused still advances correctly on resume', () => {
    const lastRunAt = new Date('2026-07-10T03:30:00.000Z'); // a prior 09:00 IST run
    const schedule = baseSchedule({
      recurrenceType: 'EVERY_X_DAYS',
      timezone: 'Asia/Kolkata',
      intervalDays: 3,
      lastRunAt,
    });

    const resumed = computeNextRunAt(schedule, new Date('2026-07-12T00:00:00.000Z'));
    expect(resumed?.toISOString()).toBe('2026-07-13T03:30:00.000Z'); // +3 civil days, still 09:00 IST
  });
});
