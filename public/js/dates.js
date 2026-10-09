/*
 * Local calendar date helpers. This is the only module that builds date keys.
 *
 * A date key is a "YYYY-MM-DD" string for a local calendar day. Never build
 * one with toISOString(): that converts to UTC and can shift the day.
 *
 * Calendar arithmetic runs on UTC day numbers internally. A key has no time
 * zone, so counting days in UTC is exact and immune to DST changes.
 */

export const WEEK_STARTS_ON = 0; // Sunday
export const LOCALE = 'en-US';

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** month is 1..12 */
export function makeKey(year, month, day) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function parseKey(key) {
  return {
    year: Number(key.slice(0, 4)),
    month: Number(key.slice(5, 7)),
    day: Number(key.slice(8, 10)),
  };
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** month is 1..12 */
export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** True for a well-formed key that names a real calendar day. */
export function isValidKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
  const { year, month, day } = parseKey(key);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function utcMs(year, month, day) {
  // setUTCFullYear keeps years 0..99 literal (Date.UTC would map them to 19xx).
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

/** Days since 1970-01-01 for a key. */
export function toDayNumber(key) {
  const { year, month, day } = parseKey(key);
  return Math.round(utcMs(year, month, day) / DAY_MS);
}

export function fromDayNumber(n) {
  const d = new Date(n * DAY_MS);
  return makeKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(key, n) {
  return fromDayNumber(toDayNumber(key) + n);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return toDayNumber(b) - toDayNumber(a);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key) {
  // 1970-01-01 was a Thursday (4).
  return (((toDayNumber(key) + 4) % 7) + 7) % 7;
}

/** Key of the first day of the week containing `key`. */
export function weekOf(key) {
  return addDays(key, -((weekday(key) - WEEK_STARTS_ON + 7) % 7));
}

/** Whole weeks between the weeks containing a and b. */
export function weeksBetween(a, b) {
  return Math.round(daysBetween(weekOf(a), weekOf(b)) / 7);
}

/** Calendar months from a's month to b's month, ignoring the day. */
export function monthsBetween(a, b) {
  const x = parseKey(a);
  const y = parseKey(b);
  return (y.year - x.year) * 12 + (y.month - x.month);
}

/** First day of the next month. */
export function startOfNextMonth(key) {
  const { year, month } = parseKey(key);
  return month === 12 ? makeKey(year + 1, 1, 1) : makeKey(year, month + 1, 1);
}

/** January 1 of the next year. */
export function startOfNextYear(key) {
  return makeKey(parseKey(key).year + 1, 1, 1);
}

// ---------------------------------------------------------------------------
// Months (the journal shows one month at a time).

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** "YYYY-MM"; month is 1..12 */
export function monthKey(year, month) {
  return `${pad(year, 4)}-${pad(month)}`;
}

/** { year, month } of a "YYYY-MM" key, or null if it is not one. */
export function parseMonthKey(key) {
  if (typeof key !== 'string' || !MONTH_KEY_RE.test(key)) return null;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month >= 1 && month <= 12 ? { year, month } : null;
}

/** The month n months after (n < 0: before) the given one, as { year, month }. */
export function shiftMonth(year, month, n) {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** Months from a to b, each { year, month } (positive when b is later). */
export function compareMonths(a, b) {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/**
 * A month's days as weeks of 7 cells, each a key or null (padding before the
 * 1st and after the last day). Weeks start on WEEK_STARTS_ON.
 */
export function monthGrid(year, month) {
  const lead = (weekday(makeKey(year, month, 1)) - WEEK_STARTS_ON + 7) % 7;
  const cells = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth(year, month); day++) cells.push(makeKey(year, month, day));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// Bridges between keys and the device clock (local time).

/** Key for a Date, read in local time. */
export function localDateKey(date = new Date()) {
  return makeKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function todayKey() {
  return localDateKey(new Date());
}

/** Local calendar day of an ISO timestamp, or null if it is not a timestamp. */
export function isoToLocalKey(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : localDateKey(d);
}

/** Milliseconds until the next local midnight. */
export function msUntilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

// ---------------------------------------------------------------------------
// Formatting.

/** "Thursday, October 8" — the year is added when it differs from ref's year. */
export function formatLong(key, ref = todayKey()) {
  const { year, month, day } = parseKey(key);
  return `${WEEKDAY_LONG[weekday(key)]}, ${MONTH_LONG[month - 1]} ${day}` + yearSuffix(year, ref);
}

/** "Oct 8" — the year is added when it differs from ref's year. */
export function formatShort(key, ref = todayKey()) {
  const { year, month, day } = parseKey(key);
  return `${MONTH_SHORT[month - 1]} ${day}` + yearSuffix(year, ref);
}

/** "Thu, Oct 8, 2026" */
export function formatWithWeekday(key) {
  const { year, month, day } = parseKey(key);
  return `${WEEKDAY_SHORT[weekday(key)]}, ${MONTH_SHORT[month - 1]} ${day}, ${year}`;
}

/** "October 2026" */
export function formatMonthYear(year, month) {
  return `${MONTH_LONG[month - 1]} ${year}`;
}

/** Local date and time of an ISO timestamp, e.g. "Oct 8, 2026, 11:00 AM". */
export function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown date';
  return d.toLocaleString(LOCALE, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function yearSuffix(year, ref) {
  return year === parseKey(ref).year ? '' : `, ${year}`;
}
