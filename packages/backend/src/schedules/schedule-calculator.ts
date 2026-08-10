import { parseExpression } from 'cron-parser';
import type { RecurrenceType, Schedule } from '@prisma/client';

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

function parseHHMM(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function setTimeOnDate(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Picks a random minute-precision time inside [start, end] on `baseDate`.
 * Honors min/max gap vs. the previous run and can avoid landing on the
 * exact same clock time as last time, as described in the RANDOM TIME
 * SCHEDULER section of the spec.
 */
export function pickRandomTime(
  baseDate: Date,
  windowStart: string,
  windowEnd: string,
  opts: { minGapMinutes?: number | null; maxGapMinutes?: number | null; avoidSameAsLast?: boolean; lastRunAt?: Date | null },
): Date {
  const start = parseHHMM(windowStart);
  const end = parseHHMM(windowEnd);

  const startDate = setTimeOnDate(baseDate, start.hours, start.minutes);
  const endDate = setTimeOnDate(baseDate, end.hours, end.minutes);
  const windowMs = Math.max(endDate.getTime() - startDate.getTime(), 60_000);

  let candidate: Date;
  let attempts = 0;

  do {
    const offsetMs = Math.floor(Math.random() * windowMs);
    candidate = new Date(startDate.getTime() + offsetMs);
    attempts++;
  } while (
    opts.avoidSameAsLast &&
    opts.lastRunAt &&
    candidate.getHours() === opts.lastRunAt.getHours() &&
    candidate.getMinutes() === opts.lastRunAt.getMinutes() &&
    attempts < 10
  );

  if (opts.lastRunAt && (opts.minGapMinutes || opts.maxGapMinutes)) {
    const gapMinutes = (candidate.getTime() - opts.lastRunAt.getTime()) / 60_000;
    if (opts.minGapMinutes && gapMinutes < opts.minGapMinutes) {
      candidate = new Date(opts.lastRunAt.getTime() + opts.minGapMinutes * 60_000);
    }
    if (opts.maxGapMinutes && gapMinutes > opts.maxGapMinutes) {
      candidate = new Date(opts.lastRunAt.getTime() + opts.maxGapMinutes * 60_000);
    }
  }

  return candidate;
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
    return pickRandomTime(base, schedule.randomWindowStart, schedule.randomWindowEnd, {
      minGapMinutes: schedule.randomMinGapMinutes,
      maxGapMinutes: schedule.randomMaxGapMinutes,
      avoidSameAsLast: schedule.avoidSameTimeAsLast,
      lastRunAt: schedule.lastRunAt,
    });
  }

  return base;
}

function computeBaseNextRun(schedule: ScheduleForCalc, from: Date): Date | null {
  const { hours, minutes } = schedule.timeOfDay ? parseHHMM(schedule.timeOfDay) : { hours: 9, minutes: 0 };

  switch (schedule.recurrenceType) {
    case 'ONE_TIME': {
      if (schedule.lastRunAt) return null;
      return schedule.startDate ?? from;
    }

    case 'EVERY_X_HOURS': {
      const hoursStep = schedule.intervalHours ?? 1;
      const anchor = schedule.lastRunAt ?? from;
      return new Date(anchor.getTime() + hoursStep * 60 * 60 * 1000);
    }

    case 'EVERY_X_DAYS': {
      const daysStep = schedule.intervalDays ?? 1;
      const anchor = schedule.lastRunAt ?? from;
      const next = new Date(anchor);
      next.setDate(next.getDate() + daysStep);
      return setTimeOnDate(next, hours, minutes);
    }

    case 'DAILY': {
      const next = nextOccurrenceAtTime(from, hours, minutes);
      return next;
    }

    case 'BUSINESS_DAYS': {
      let next = nextOccurrenceAtTime(from, hours, minutes);
      while (!isBusinessDay(next)) next.setDate(next.getDate() + 1);
      return next;
    }

    case 'WEEKENDS': {
      let next = nextOccurrenceAtTime(from, hours, minutes);
      while (!isWeekend(next)) next.setDate(next.getDate() + 1);
      return next;
    }

    case 'WEEKLY': {
      const days = schedule.daysOfWeek.length ? schedule.daysOfWeek : [from.getDay()];
      return nextOccurrenceOnDaysOfWeek(from, days, hours, minutes);
    }

    case 'MONTHLY': {
      const anchorDay = (schedule.startDate ?? from).getDate();
      const next = setTimeOnDate(from, hours, minutes);
      next.setDate(anchorDay);
      if (next <= from) next.setMonth(next.getMonth() + 1);
      return next;
    }

    case 'YEARLY': {
      const anchor = schedule.startDate ?? from;
      const next = setTimeOnDate(from, hours, minutes);
      next.setMonth(anchor.getMonth(), anchor.getDate());
      if (next <= from) next.setFullYear(next.getFullYear() + 1);
      return next;
    }

    case 'SPECIFIC_DATES': {
      // Specific dates are stored as ISO strings inside the schedule's
      // messagePool-adjacent audienceRef by the service layer; the pure
      // calculator only handles the generic case here so it stays testable.
      return schedule.startDate && schedule.startDate > from ? schedule.startDate : null;
    }

    case 'CUSTOM_CRON': {
      if (!schedule.cronExpression) return null;
      try {
        const interval = parseExpression(schedule.cronExpression, {
          currentDate: from,
          tz: schedule.timezone,
        });
        return interval.next().toDate();
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

function nextOccurrenceAtTime(from: Date, hours: number, minutes: number): Date {
  const next = setTimeOnDate(from, hours, minutes);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}

function nextOccurrenceOnDaysOfWeek(from: Date, daysOfWeek: number[], hours: number, minutes: number): Date {
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + i);
    const withTime = setTimeOnDate(candidate, hours, minutes);
    if (daysOfWeek.includes(withTime.getDay()) && withTime > from) {
      return withTime;
    }
  }
  // Fallback: one week out on the first configured day.
  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 7);
  return setTimeOnDate(fallback, hours, minutes);
}

/** Picks one message at random from the schedule's message pool (RANDOM MESSAGE SELECTION). */
export function pickRandomMessage(pool: unknown[]): unknown | null {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
