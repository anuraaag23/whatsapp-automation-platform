import { parseExpression } from 'cron-parser';
import type { Schedule } from '@prisma/client';

export type ScheduleForCalc = Pick<
  Schedule,
  | 'recurrenceType'
  | 'cronExpression'
  | 'intervalHours'
  | 'intervalDays'
  | 'daysOfWeek'
  | 'timeOfDay'
  | 'timezone'
  | 'randomTimeEnabled'
  | 'randomWindowStart'
  | 'randomWindowEnd'
  | 'randomMinGapMinutes'
  | 'randomMaxGapMinutes'
  | 'avoidSameTimeAsLast'
  | 'lastRunAt'
  | 'startDate'
  | 'expiryDate'
>;

/**
 * Raised when a random-time window and a configured min/max gap from the
 * last run have no overlap at all — e.g. a 09:00-09:10 window with a
 * 30-minute minimum gap from a run at 09:05. There is deliberately no
 * "closest valid time" fallback for this: silently picking a time outside
 * the window the user configured is exactly the bug this calculator used
 * to have. Callers should surface this as a clear validation error rather
 * than let a schedule quietly fire at a time nobody asked for.
 */
export class SchedulingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulingConflictError';
  }
}

function parseHHMM(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

// ---------------------------------------------------------------------------
// Timezone primitives
//
// The schedule stores an IANA zone name (e.g. "Asia/Kolkata") and a plain
// "HH:MM" local time. Two conversions are needed, and nothing beyond the
// runtime's built-in Intl/ICU support (already required by Node) is used
// for either of them — cron-parser (already a dependency, already used for
// CUSTOM_CRON) supplies its own correct, DST-aware "next occurrence in this
// zone" logic, so hand-rolled zoned-time math is kept to the two small
// primitives below plus the recurrence types cron genuinely can't express
// (EVERY_X_DAYS, and the random-time window).
// ---------------------------------------------------------------------------

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday .. 6 = Saturday, matching Date.prototype.getDay() and the
   *  convention already used for Schedule.daysOfWeek. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Reads the wall-clock date/time that `date` (a UTC instant) corresponds to in `timeZone`. */
function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // h23 hourCycle can render midnight as "24" in some ICU builds.
    hour: map.hour === '24' ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

/**
 * Inverse of getZonedParts: returns the UTC instant whose wall clock in
 * `timeZone` reads as the given date/time components. Implemented via the
 * standard fixed-point technique for inverting an Intl-based zoned
 * formatter — guess the instant as if the components were UTC, check what
 * they actually render as in the target zone, and correct by the
 * difference. This converges in one pass for ordinary zones and two for the
 * (rare) cases right at a DST boundary; three iterations is a safety
 * margin, not a requirement.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = targetMs;

  for (let i = 0; i < 3; i++) {
    const observed = getZonedParts(new Date(guessMs), timeZone);
    const observedMs = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const diff = observedMs - targetMs;
    if (diff === 0) break;
    guessMs -= diff;
  }

  return new Date(guessMs);
}

/** Runs a cron expression forward from `from`, evaluated in `timezone`. */
function nextCronOccurrence(cronExpr: string, from: Date, timezone: string): Date | null {
  try {
    const interval = parseExpression(cronExpr, { currentDate: from, tz: timezone || 'UTC' });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Random time window
// ---------------------------------------------------------------------------

/**
 * Picks a random instant inside the schedule's local [windowStart, windowEnd]
 * time-of-day window, on the calendar day `baseDate` falls on *in
 * `timezone`*, honoring min/max gap vs. the previous run and optionally
 * avoiding the exact same local clock-minute as last time.
 *
 * The valid range is computed first (window intersected with the min/max
 * gap bounds, both expressed as UTC instants), and a candidate is drawn
 * only from inside that range — never generated first and then pushed back
 * into bounds. If the intersection is empty, this throws
 * SchedulingConflictError rather than silently picking a time outside the
 * window the user configured.
 */
export function pickRandomTime(
  baseDate: Date,
  windowStart: string,
  windowEnd: string,
  timezone: string,
  opts: {
    minGapMinutes?: number | null;
    maxGapMinutes?: number | null;
    avoidSameAsLast?: boolean;
    lastRunAt?: Date | null;
  } = {},
): Date {
  const zone = timezone || 'UTC';
  const calendarDay = getZonedParts(baseDate, zone);
  const start = parseHHMM(windowStart);
  const end = parseHHMM(windowEnd);

  const windowStartUtc = zonedTimeToUtc(
    calendarDay.year,
    calendarDay.month,
    calendarDay.day,
    start.hours,
    start.minutes,
    0,
    zone,
  );
  let windowEndUtc = zonedTimeToUtc(calendarDay.year, calendarDay.month, calendarDay.day, end.hours, end.minutes, 0, zone);
  if (windowEndUtc <= windowStartUtc) {
    // A misconfigured or zero-width window; keep at least a minute of
    // range rather than producing an inverted one.
    windowEndUtc = new Date(windowStartUtc.getTime() + 60_000);
  }

  let rangeStartMs = windowStartUtc.getTime();
  let rangeEndMs = windowEndUtc.getTime();

  if (opts.lastRunAt) {
    if (opts.minGapMinutes) {
      rangeStartMs = Math.max(rangeStartMs, opts.lastRunAt.getTime() + opts.minGapMinutes * 60_000);
    }
    if (opts.maxGapMinutes) {
      rangeEndMs = Math.min(rangeEndMs, opts.lastRunAt.getTime() + opts.maxGapMinutes * 60_000);
    }
  }

  if (rangeStartMs > rangeEndMs) {
    throw new SchedulingConflictError(
      `No valid random-time candidate exists inside ${windowStart}-${windowEnd} (${zone}) ` +
        'given the configured minimum/maximum gap from the last run.',
    );
  }

  const pickInRange = (): Date => {
    const span = rangeEndMs - rangeStartMs;
    const offset = Math.floor(Math.random() * (span + 1));
    return new Date(rangeStartMs + offset);
  };

  let candidate = pickInRange();

  if (opts.avoidSameAsLast && opts.lastRunAt) {
    const lastParts = getZonedParts(opts.lastRunAt, zone);
    let attempts = 0;
    while (attempts < 10 && sameLocalMinute(getZonedParts(candidate, zone), lastParts)) {
      candidate = pickInRange();
      attempts++;
    }
  }

  return candidate;
}

function sameLocalMinute(a: ZonedParts, b: ZonedParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
}

/**
 * Computes the next execution timestamp for a schedule, applying the random
 * time window on top of whatever base recurrence produced if enabled.
 */
export function computeNextRunAt(schedule: ScheduleForCalc, from: Date = new Date()): Date | null {
  const base = computeBaseNextRun(schedule, from);
  if (!base) return null;

  if (schedule.expiryDate && base > schedule.expiryDate) return null;

  if (schedule.randomTimeEnabled && schedule.randomWindowStart && schedule.randomWindowEnd) {
    return pickRandomTime(base, schedule.randomWindowStart, schedule.randomWindowEnd, schedule.timezone || 'UTC', {
      minGapMinutes: schedule.randomMinGapMinutes,
      maxGapMinutes: schedule.randomMaxGapMinutes,
      avoidSameAsLast: schedule.avoidSameTimeAsLast,
      lastRunAt: schedule.lastRunAt,
    });
  }

  return base;
}

function computeBaseNextRun(schedule: ScheduleForCalc, from: Date): Date | null {
  const zone = schedule.timezone || 'UTC';
  const { hours, minutes } = schedule.timeOfDay ? parseHHMM(schedule.timeOfDay) : { hours: 9, minutes: 0 };

  switch (schedule.recurrenceType) {
    case 'ONE_TIME': {
      if (schedule.lastRunAt) return null;
      // startDate is stored as an absolute instant (already converted to
      // UTC when the schedule was created), so it needs no zone handling.
      return schedule.startDate ?? from;
    }

    case 'EVERY_X_HOURS': {
      // Adding a fixed duration to a UTC instant is unambiguous regardless
      // of timezone — "4 hours from now" means the same physical moment no
      // matter what wall clock you read it on. No zone conversion needed.
      const hoursStep = schedule.intervalHours ?? 1;
      const anchor = schedule.lastRunAt ?? from;
      return new Date(anchor.getTime() + hoursStep * 60 * 60 * 1000);
    }

    case 'EVERY_X_DAYS': {
      // Unlike EVERY_X_HOURS, "every N days" is a CIVIL CALENDAR step (skip
      // N calendar dates, in the schedule's zone), then apply the
      // configured local time-of-day — this can span a DST transition, so
      // it isn't just "add N*24 hours".
      const daysStep = schedule.intervalDays ?? 1;
      const anchor = schedule.lastRunAt ?? from;
      const anchorParts = getZonedParts(anchor, zone);

      // Pure calendar-date arithmetic via Date.UTC, which normalizes
      // month/year overflow for us (e.g. day 32 rolls into next month) —
      // this is manipulating a civil date, not an instant, so there's no
      // DST to account for at this step.
      const advanced = new Date(Date.UTC(anchorParts.year, anchorParts.month - 1, anchorParts.day + daysStep));

      return zonedTimeToUtc(
        advanced.getUTCFullYear(),
        advanced.getUTCMonth() + 1,
        advanced.getUTCDate(),
        hours,
        minutes,
        0,
        zone,
      );
    }

    case 'DAILY':
      return nextCronOccurrence(`${minutes} ${hours} * * *`, from, zone);

    case 'BUSINESS_DAYS':
      return nextCronOccurrence(`${minutes} ${hours} * * 1-5`, from, zone);

    case 'WEEKENDS':
      return nextCronOccurrence(`${minutes} ${hours} * * 0,6`, from, zone);

    case 'WEEKLY': {
      const days = schedule.daysOfWeek.length ? schedule.daysOfWeek : [getZonedParts(from, zone).weekday];
      return nextCronOccurrence(`${minutes} ${hours} * * ${days.join(',')}`, from, zone);
    }

    case 'MONTHLY': {
      const anchor = getZonedParts(schedule.startDate ?? from, zone);
      return nextCronOccurrence(`${minutes} ${hours} ${anchor.day} * *`, from, zone);
    }

    case 'YEARLY': {
      const anchor = getZonedParts(schedule.startDate ?? from, zone);
      return nextCronOccurrence(`${minutes} ${hours} ${anchor.day} ${anchor.month} *`, from, zone);
    }

    case 'SPECIFIC_DATES': {
      // Specific dates are stored as ISO strings inside the schedule's
      // messagePool-adjacent audienceRef by the service layer; the pure
      // calculator only handles the generic case here so it stays testable.
      return schedule.startDate && schedule.startDate > from ? schedule.startDate : null;
    }

    case 'CUSTOM_CRON': {
      if (!schedule.cronExpression) return null;
      return nextCronOccurrence(schedule.cronExpression, from, zone);
    }

    default:
      return null;
  }
}

/** Picks one message at random from the schedule's message pool (RANDOM MESSAGE SELECTION). */
export function pickRandomMessage(pool: unknown[]): unknown | null {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
