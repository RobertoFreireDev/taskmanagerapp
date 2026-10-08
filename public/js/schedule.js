/*
 * Scheduling rules. Pure: no DOM, no storage, no clock. Callers pass `today`.
 * Covered by tests/schedule.test.js.
 */

import {
  WEEK_STARTS_ON, WEEKDAY_SHORT, MONTH_SHORT,
  isValidKey, parseKey, addDays, daysBetween, weekday, weekOf, weeksBetween,
  monthsBetween, daysInMonth, startOfNextMonth, startOfNextYear, isoToLocalKey, formatShort,
} from './dates.js';

export const RECURRENCE_TYPES = ['once', 'daily', 'weekly', 'monthly', 'yearly'];

/** How far back Home looks for a missed occurrence of a recurring task. */
export const LOOKBACK_DAYS = 366;

export function normalizeInterval(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Weekdays a weekly rule repeats on; an empty list means the start date's weekday. */
export function effectiveWeekdays(rec) {
  return rec.weekdays?.length ? rec.weekdays : [weekday(rec.startDate)];
}

/** Month days a monthly rule repeats on; an empty list means the start date's day. */
export function effectiveMonthDays(rec) {
  return rec.monthDays?.length ? rec.monthDays : [parseKey(rec.startDate).day];
}

/** Month+day pairs a yearly rule repeats on; an empty list means the start date's. */
export function effectiveYearDays(rec) {
  if (rec.yearDays?.length) return rec.yearDays;
  const { month, day } = parseKey(rec.startDate);
  return [{ month, day }];
}

/** Is `task` due on the calendar day `date` ("YYYY-MM-DD")? */
export function isDue(task, date) {
  const rec = task?.recurrence;
  if (!rec || !isValidKey(rec.startDate) || !isValidKey(date)) return false;
  const start = rec.startDate;
  if (date < start) return false;
  const interval = normalizeInterval(rec.interval);

  switch (rec.type) {
    case 'once':
      return date === start;

    case 'daily':
      return daysBetween(start, date) % interval === 0;

    case 'weekly':
      return (
        effectiveWeekdays(rec).includes(weekday(date)) &&
        weeksBetween(weekOf(start), weekOf(date)) % interval === 0
      );

    case 'monthly': {
      const { year, month, day } = parseKey(date);
      const last = daysInMonth(year, month);
      // A day past the end of the month (31 in April) falls on the last day.
      return (
        effectiveMonthDays(rec).some((d) => Math.min(d, last) === day) &&
        monthsBetween(start, date) % interval === 0
      );
    }

    case 'yearly': {
      const { year, month, day } = parseKey(date);
      const last = daysInMonth(year, month);
      // Feb 29 falls on Feb 28 in non-leap years.
      return (
        effectiveYearDays(rec).some((e) => e.month === month && Math.min(e.day, last) === day) &&
        (year - parseKey(start).year) % interval === 0
      );
    }

    default:
      return false;
  }
}

/** The next `count` due dates on or after `from`. */
export function nextOccurrences(task, from, count = 5, maxDays = LOOKBACK_DAYS * 100) {
  const rec = task?.recurrence;
  if (!rec || !isValidKey(rec.startDate) || !isValidKey(from) || !RECURRENCE_TYPES.includes(rec.type)) return [];
  const start = rec.startDate;
  if (rec.type === 'once') return start >= from ? [start] : [];

  const interval = normalizeInterval(rec.interval);
  const out = [];
  let d = start > from ? start : from;
  const end = addDays(d, maxDays);
  while (out.length < count && d <= end) {
    if (isDue(task, d)) {
      out.push(d);
      d = addDays(d, 1);
    } else {
      d = skipAhead(rec, d, interval);
    }
  }
  return out;
}

/** Next day worth checking after a non-due `d`: jumps over periods the interval rules out. */
function skipAhead(rec, d, interval) {
  const start = rec.startDate;
  switch (rec.type) {
    case 'daily':
      return addDays(d, interval - (daysBetween(start, d) % interval));
    case 'weekly':
      if (weeksBetween(weekOf(start), weekOf(d)) % interval !== 0) return addDays(weekOf(d), 7);
      break;
    case 'monthly':
      if (monthsBetween(start, d) % interval !== 0) return startOfNextMonth(d);
      break;
    case 'yearly':
      if ((parseKey(d).year - parseKey(start).year) % interval !== 0) return startOfNextYear(d);
      break;
  }
  return addDays(d, 1);
}

/**
 * The occurrence date a not-due-today task is pending for, or null.
 * `progress` is the task's own map: { [date]: Occurrence }.
 */
export function pendingDate(task, progress, today) {
  const rec = task?.recurrence;
  if (!rec || !isValidKey(rec.startDate) || rec.startDate >= today) return null;
  const done = (d) => Boolean(progress?.[d]?.completedAt);

  // A once task that was never done stays pending, however old it is.
  if (rec.type === 'once') return done(rec.startDate) ? null : rec.startDate;

  let lower = rec.startDate;
  const lastDone = lastCompletedDate(progress);
  if (lastDone && lastDone >= lower) lower = addDays(lastDone, 1);
  const limit = addDays(today, -LOOKBACK_DAYS);
  if (limit > lower) lower = limit;

  for (let d = addDays(today, -1); d >= lower; d = addDays(d, -1)) {
    if (isDue(task, d)) return done(d) ? null : d;
  }
  return null;
}

function lastCompletedDate(progress) {
  let last = null;
  for (const [date, occ] of Object.entries(progress ?? {})) {
    if (occ?.completedAt && (!last || date > last)) last = date;
  }
  return last;
}

/** Latest occurrence date whose completion happened on `today` (local time), or null. */
export function completedOn(progress, today) {
  let found = null;
  for (const [date, occ] of Object.entries(progress ?? {})) {
    if (occ?.completedAt && isoToLocalKey(occ.completedAt) === today && (!found || date > found)) found = date;
  }
  return found;
}

const byName = (a, b) => a.task.name.localeCompare(b.task.name, undefined, { sensitivity: 'base' });

/**
 * Splits active tasks into Home's sections. Each item is { task, date } where
 * `date` is the occurrence the card acts on. A task appears at most once.
 */
export function homeSections(state, today) {
  const todo = [];
  const pending = [];
  const done = [];
  for (const task of state.tasks ?? []) {
    if (task.active !== true) continue;
    const progress = state.progress?.[task.id] ?? {};

    const doneDate = completedOn(progress, today);
    if (doneDate) {
      done.push({ task, date: doneDate });
    } else if (isDue(task, today)) {
      todo.push({ task, date: today });
    } else {
      const since = pendingDate(task, progress, today);
      if (since) pending.push({ task, date: since });
    }
  }
  todo.sort(byName);
  pending.sort(byName);
  done.sort(byName);
  return { todo, pending, done };
}

/** Checked/total for an occurrence, counting only items still on the task. */
export function checklistProgress(task, occurrence) {
  const total = task.checklist?.length ?? 0;
  const checked = occurrence?.checklist ?? {};
  const done = (task.checklist ?? []).filter((item) => checked[item.id] === true).length;
  return { done, total };
}

/** One-line summary, e.g. "Every 2 weeks · Mon, Thu" or "Monthly · 1, 15". */
export function describeRecurrence(rec, today) {
  if (!rec || !isValidKey(rec.startDate)) return 'No schedule';
  const n = normalizeInterval(rec.interval);
  const every = (one, unit) => (n === 1 ? one : `Every ${n} ${unit}`);
  let text;
  switch (rec.type) {
    case 'once':
      return `Once · ${formatShort(rec.startDate, today ?? rec.startDate)}`;
    case 'daily':
      text = every('Daily', 'days');
      break;
    case 'weekly': {
      const days = [...effectiveWeekdays(rec)].sort(
        (a, b) => ((a - WEEK_STARTS_ON + 7) % 7) - ((b - WEEK_STARTS_ON + 7) % 7),
      );
      text = `${every('Weekly', 'weeks')} · ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
      break;
    }
    case 'monthly':
      text = `${every('Monthly', 'months')} · ${[...effectiveMonthDays(rec)].sort((a, b) => a - b).join(', ')}`;
      break;
    case 'yearly': {
      const days = [...effectiveYearDays(rec)].sort((a, b) => a.month - b.month || a.day - b.day);
      text = `${every('Yearly', 'years')} · ${days.map((e) => `${MONTH_SHORT[e.month - 1]} ${e.day}`).join(', ')}`;
      break;
    }
    default:
      return 'No schedule';
  }
  if (today && rec.startDate > today) text += ` · starts ${formatShort(rec.startDate, today)}`;
  return text;
}
