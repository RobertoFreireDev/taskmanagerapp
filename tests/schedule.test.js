import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isDue, homeSections, pendingDate, nextOccurrences, dueDatesBetween, describeRecurrence, checklistProgress, LOOKBACK_DAYS,
} from '../public/js/schedule.js';
import {
  addDays, daysBetween, weekday, weekOf, weeksBetween, monthsBetween, isValidKey, localDateKey,
  isoToLocalKey, daysInMonth, formatShort, monthKey, parseMonthKey, shiftMonth, compareMonths, monthGrid, formatMonthYear,
} from '../public/js/dates.js';

// 2026-10-08 is a Thursday. Week of Sun 2026-10-04 … Sat 2026-10-10.
const TODAY = '2026-10-08';

function makeTask(recurrence, extra = {}) {
  return {
    id: 't1',
    kind: 'regular',
    icon: 'task',
    name: 'Task',
    active: true,
    notes: [],
    checklist: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
    recurrence: { type: 'daily', interval: 1, weekdays: [], monthDays: [], yearDays: [], startDate: '2026-01-01', ...recurrence },
  };
}

/** All due dates in [from, to]. */
function dueBetween(task, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isDue(task, d)) out.push(d);
  return out;
}

/** ISO timestamp for a local wall-clock time on a calendar day. */
function at(key, hour = 12, minute = 0) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

const done = (key, hour) => ({ checklist: {}, completedAt: at(key, hour) });
const notDone = (key, hour) => ({ checklist: {}, completedAt: null, missedAt: at(key, hour) });

function sections(tasks, progress = {}, today = TODAY) {
  const s = homeSections({ schemaVersion: 1, tasks, progress }, today);
  const pick = (items) => items.map(({ task, date }) => [task.id, date]);
  return { todo: pick(s.todo), pending: pick(s.pending), done: pick(s.done), missed: pick(s.missed) };
}

// ---------------------------------------------------------------------------

describe('dates helpers', () => {
  test('weekday, weekOf (weeks start on Sunday) and weeksBetween', () => {
    assert.equal(weekday(TODAY), 4);
    assert.equal(weekOf(TODAY), '2026-10-04');
    assert.equal(weekOf('2026-10-04'), '2026-10-04');
    assert.equal(weekOf('2026-10-10'), '2026-10-04');
    assert.equal(weeksBetween('2026-10-10', '2026-10-11'), 1);
    assert.equal(weeksBetween('2026-10-04', '2026-10-10'), 0);
  });

  test('day arithmetic crosses months, years and DST changes', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29');
    assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2); // US DST starts 2026-03-08
    assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2); // EU DST ends 2026-10-25
    assert.equal(monthsBetween('2026-01-31', '2027-03-01'), 14);
  });

  test('isValidKey rejects malformed and impossible dates', () => {
    assert.ok(isValidKey('2028-02-29'));
    assert.ok(!isValidKey('2026-02-29'));
    assert.ok(!isValidKey('2026-04-31'));
    assert.ok(!isValidKey('2026-1-01'));
    assert.ok(!isValidKey('2026-10-08T00:00'));
    assert.ok(!isValidKey(null));
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29);
  });

  test('local keys come from local time, not UTC', () => {
    assert.equal(localDateKey(new Date(2026, 9, 8, 23, 59)), '2026-10-08');
    assert.equal(localDateKey(new Date(2026, 9, 8, 0, 1)), '2026-10-08');
    assert.equal(isoToLocalKey(at('2026-10-08', 23, 30)), '2026-10-08');
    assert.equal(isoToLocalKey(at('2026-10-08', 0, 30)), '2026-10-08');
    assert.equal(isoToLocalKey('not a date'), null);
  });

  test('formatShort adds the year only when it differs from the reference', () => {
    assert.equal(formatShort('2026-10-05', TODAY), 'Oct 5');
    assert.equal(formatShort('2025-01-01', TODAY), 'Jan 1, 2025');
  });

  test('month keys build, parse and reject malformed months', () => {
    assert.equal(monthKey(2026, 3), '2026-03');
    assert.deepEqual(parseMonthKey('2026-10'), { year: 2026, month: 10 });
    assert.equal(parseMonthKey('2026-13'), null);
    assert.equal(parseMonthKey('2026-00'), null);
    assert.equal(parseMonthKey('2026-1'), null);
    assert.equal(parseMonthKey('2026-10-08'), null);
    assert.equal(parseMonthKey(undefined), null);
    assert.equal(formatMonthYear(2026, 10), 'October 2026');
  });

  test('shiftMonth and compareMonths cross year boundaries', () => {
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth(2026, 10, -22), { year: 2024, month: 12 });
    assert.deepEqual(shiftMonth(2026, 10, 0), { year: 2026, month: 10 });
    assert.equal(compareMonths({ year: 2025, month: 12 }, { year: 2026, month: 1 }), 1);
    assert.equal(compareMonths({ year: 2026, month: 10 }, { year: 2026, month: 10 }), 0);
    assert.equal(compareMonths({ year: 2026, month: 10 }, { year: 2026, month: 8 }), -2);
  });

  test('monthGrid lays a month out in Sunday-first weeks', () => {
    // October 2026 starts on a Thursday.
    const oct = monthGrid(2026, 10);
    assert.equal(oct.length, 5);
    assert.ok(oct.every((week) => week.length === 7));
    assert.deepEqual(oct[0], [null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    assert.deepEqual(oct[4], ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    assert.equal(oct.flat().filter(Boolean).length, 31);

    // February 2026 starts on a Sunday and fills exactly four weeks.
    const feb = monthGrid(2026, 2);
    assert.equal(feb.length, 4);
    assert.equal(feb[0][0], '2026-02-01');
    assert.equal(feb[3][6], '2026-02-28');

    // Leap February.
    const leap = monthGrid(2028, 2).flat().filter(Boolean);
    assert.equal(leap.length, 29);
    assert.equal(leap.at(-1), '2028-02-29');
  });
});

// ---------------------------------------------------------------------------

describe('isDue: once', () => {
  test('due only on the start date', () => {
    const t = makeTask({ type: 'once', startDate: '2026-10-08' });
    assert.deepEqual(dueBetween(t, '2026-10-01', '2026-10-31'), ['2026-10-08']);
  });

  test('interval is ignored', () => {
    const t = makeTask({ type: 'once', interval: 5, startDate: '2026-10-08' });
    assert.ok(isDue(t, '2026-10-08'));
    assert.ok(!isDue(t, '2026-10-13'));
  });
});

describe('isDue: daily', () => {
  test('interval 1 is due every day from the start date', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-06' });
    assert.deepEqual(dueBetween(t, '2026-10-04', '2026-10-09'), ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  });

  test('interval 3 is due every third day', () => {
    const t = makeTask({ type: 'daily', interval: 3, startDate: '2026-10-01' });
    assert.deepEqual(dueBetween(t, '2026-10-01', '2026-10-12'), ['2026-10-01', '2026-10-04', '2026-10-07', '2026-10-10']);
  });

  test('interval keeps its rhythm across a month and year boundary', () => {
    const t = makeTask({ type: 'daily', interval: 2, startDate: '2026-12-30' });
    assert.deepEqual(dueBetween(t, '2026-12-30', '2027-01-05'), ['2026-12-30', '2027-01-01', '2027-01-03', '2027-01-05']);
  });

  test('a bad interval is treated as 1', () => {
    const t = makeTask({ type: 'daily', interval: 0, startDate: '2026-10-06' });
    assert.ok(isDue(t, '2026-10-07'));
  });
});

describe('isDue: weekly', () => {
  test('interval 1 on Mon and Thu', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1, 4], startDate: '2026-10-01' });
    assert.deepEqual(dueBetween(t, '2026-10-01', '2026-10-15'), ['2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15']);
  });

  test('interval 2 skips every other week', () => {
    const t = makeTask({ type: 'weekly', interval: 2, weekdays: [1, 4], startDate: '2026-10-05' });
    assert.deepEqual(dueBetween(t, '2026-10-04', '2026-10-31'), ['2026-10-05', '2026-10-08', '2026-10-19', '2026-10-22']);
  });

  test('weeks start on Sunday: Sat start, next-day Sunday is already week 1', () => {
    // Start Saturday 2026-10-10. With every 2 weeks on Sun+Sat, Sunday 10-11 opens
    // the next week (odd), so it is skipped; Sunday 10-18 is week 2.
    const t = makeTask({ type: 'weekly', interval: 2, weekdays: [0, 6], startDate: '2026-10-10' });
    assert.deepEqual(dueBetween(t, '2026-10-10', '2026-10-25'), ['2026-10-10', '2026-10-18', '2026-10-24']);
  });

  test('empty weekdays uses the weekday of the start date', () => {
    const t = makeTask({ type: 'weekly', weekdays: [], startDate: '2026-10-08' }); // Thursday
    assert.deepEqual(dueBetween(t, '2026-10-01', '2026-10-31'), ['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  });

  test('a chosen weekday earlier in the start week is not due', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-10-07' }); // Wed start, Mondays
    assert.deepEqual(dueBetween(t, '2026-10-04', '2026-10-13'), ['2026-10-12']);
  });
});

describe('isDue: monthly', () => {
  test('interval 1 on the 1st and 15th', () => {
    const t = makeTask({ type: 'monthly', monthDays: [1, 15], startDate: '2026-10-01' });
    assert.deepEqual(dueBetween(t, '2026-10-01', '2026-11-30'), ['2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15']);
  });

  test('interval 3 counts calendar months from the start month', () => {
    const t = makeTask({ type: 'monthly', interval: 3, monthDays: [10], startDate: '2026-01-20' });
    // Jan 10 is before the start; Apr, Jul, Oct follow.
    assert.deepEqual(dueBetween(t, '2026-01-01', '2026-12-31'), ['2026-04-10', '2026-07-10', '2026-10-10']);
  });

  test('empty monthDays uses the day of the start date', () => {
    const t = makeTask({ type: 'monthly', monthDays: [], startDate: '2026-09-17' });
    assert.deepEqual(dueBetween(t, '2026-09-01', '2026-11-30'), ['2026-09-17', '2026-10-17', '2026-11-17']);
  });

  test('day 31 falls on the last day of short months', () => {
    const t = makeTask({ type: 'monthly', monthDays: [31], startDate: '2026-01-01' });
    assert.deepEqual(dueBetween(t, '2026-01-01', '2026-06-30'), [
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
    ]);
  });

  test('day 31 lands on Feb 29 in a leap year', () => {
    const t = makeTask({ type: 'monthly', monthDays: [31], startDate: '2028-01-01' });
    assert.ok(isDue(t, '2028-02-29'));
    assert.ok(!isDue(t, '2028-02-28'));
  });

  test('a Jan 31 start with empty monthDays keeps the end of the month', () => {
    const t = makeTask({ type: 'monthly', monthDays: [], startDate: '2026-01-31' });
    assert.deepEqual(dueBetween(t, '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  test('30 and 31 in a 30-day month give one occurrence', () => {
    const t = makeTask({ type: 'monthly', monthDays: [30, 31], startDate: '2026-04-01' });
    assert.deepEqual(dueBetween(t, '2026-04-01', '2026-04-30'), ['2026-04-30']);
  });
});

describe('isDue: yearly', () => {
  test('interval 1 on several dates', () => {
    const t = makeTask({ type: 'yearly', yearDays: [{ month: 3, day: 15 }, { month: 12, day: 25 }], startDate: '2026-01-01' });
    assert.deepEqual(dueBetween(t, '2026-01-01', '2027-12-31'), ['2026-03-15', '2026-12-25', '2027-03-15', '2027-12-25']);
  });

  test('interval 2 skips odd years from the start year', () => {
    const t = makeTask({ type: 'yearly', interval: 2, yearDays: [{ month: 6, day: 1 }], startDate: '2026-01-01' });
    assert.ok(isDue(t, '2026-06-01'));
    assert.ok(!isDue(t, '2027-06-01'));
    assert.ok(isDue(t, '2028-06-01'));
  });

  test('empty yearDays uses the month and day of the start date', () => {
    const t = makeTask({ type: 'yearly', yearDays: [], startDate: '2026-10-08' });
    assert.ok(isDue(t, '2026-10-08'));
    assert.ok(isDue(t, '2027-10-08'));
    assert.ok(!isDue(t, '2027-10-09'));
  });

  test('Feb 29 falls on Feb 28 in non-leap years', () => {
    const t = makeTask({ type: 'yearly', yearDays: [], startDate: '2024-02-29' });
    assert.ok(isDue(t, '2024-02-29'));
    assert.ok(isDue(t, '2025-02-28'));
    assert.ok(!isDue(t, '2025-03-01'));
    assert.ok(isDue(t, '2026-02-28'));
    assert.ok(isDue(t, '2028-02-29'));
    assert.ok(!isDue(t, '2028-02-28'));
  });

  test('explicit Feb 29 entry in leap and non-leap years', () => {
    const t = makeTask({ type: 'yearly', yearDays: [{ month: 2, day: 29 }], startDate: '2026-01-01' });
    assert.deepEqual(dueBetween(t, '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
  });
});

describe('isDue: future start date', () => {
  for (const type of ['once', 'daily', 'weekly', 'monthly', 'yearly']) {
    test(`${type} is never due before its start date`, () => {
      const t = makeTask({ type, startDate: '2026-11-15' });
      assert.deepEqual(dueBetween(t, '2025-11-15', '2026-11-14'), []);
      assert.ok(isDue(t, '2026-11-15'));
    });
  }

  test('a future task is not on Home at all', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-09' });
    assert.deepEqual(sections([t]), { todo: [], pending: [], done: [], missed: [] });
  });
});

// ---------------------------------------------------------------------------

describe('homeSections', () => {
  test('a task due today is in TO DO for today', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-01' });
    assert.deepEqual(sections([t]).todo, [['t1', TODAY]]);
  });

  test('due today with a missed earlier occurrence shows in TO DO only (missed ones are skipped)', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-09-01' });
    assert.deepEqual(sections([t]), { todo: [['t1', TODAY]], pending: [], done: [], missed: [] });
  });

  test('completed today moves to Done; undo brings it back to TO DO', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-01' });
    assert.deepEqual(sections([t], { t1: { [TODAY]: done(TODAY) } }), { todo: [], pending: [], done: [['t1', TODAY]], missed: [] });
    assert.deepEqual(sections([t], { t1: { [TODAY]: { checklist: {}, completedAt: null } } }).todo, [['t1', TODAY]]);
  });

  test('a completion late at night counts for that local day', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-01' });
    const progress = { t1: { [TODAY]: done(TODAY, 23) } };
    assert.deepEqual(sections([t], progress).done, [['t1', TODAY]]);
    // The next day it is a fresh occurrence.
    assert.deepEqual(sections([t], progress, '2026-10-09').todo, [['t1', '2026-10-09']]);
  });

  test('pending: most recent missed due date, with "since" date', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-09-07' }); // Mondays
    assert.deepEqual(sections([t]), { todo: [], pending: [['t1', '2026-10-05']], done: [], missed: [] });
  });

  test('pending: nothing when the last occurrence was completed', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-09-07' });
    assert.deepEqual(sections([t], { t1: { '2026-10-05': done('2026-10-05') } }).pending, []);
  });

  test('pending: lookback stops at the last completed occurrence', () => {
    const t = makeTask({ type: 'monthly', monthDays: [1], startDate: '2026-01-01' });
    // Sept done, Oct 1 missed → pending since Oct 1.
    assert.deepEqual(sections([t], { t1: { '2026-09-01': done('2026-09-01') } }).pending, [['t1', '2026-10-01']]);
    // Oct done (even if Sept was missed) → nothing.
    assert.deepEqual(sections([t], { t1: { '2026-10-01': done('2026-10-02') } }).pending, []);
  });

  test('pending: lookback stops at the start date', () => {
    const t = makeTask({ type: 'weekly', weekdays: [2], startDate: '2026-10-07' }); // Tuesdays, Wed start
    assert.equal(pendingDate(t, {}, TODAY), null);
  });

  test(`pending: lookback is limited to ${LOOKBACK_DAYS} days`, () => {
    // Every 2 years on Jan 1 from 2023: last due 2025-01-01, over 366 days ago.
    const old = makeTask({ type: 'yearly', interval: 2, yearDays: [{ month: 1, day: 1 }], startDate: '2023-01-01' });
    assert.equal(pendingDate(old, {}, TODAY), null);
    // Yearly on Jan 1: last due 2026-01-01, within the window.
    const recent = makeTask({ type: 'yearly', yearDays: [{ month: 1, day: 1 }], startDate: '2020-01-01' });
    assert.equal(pendingDate(recent, {}, TODAY), '2026-01-01');
    // Exactly 366 days back is still inside the window; 367 is not.
    const edge = makeTask({ type: 'daily', interval: 1000, startDate: addDays(TODAY, -366) });
    assert.equal(pendingDate(edge, {}, TODAY), addDays(TODAY, -366));
    const past = makeTask({ type: 'daily', interval: 1000, startDate: addDays(TODAY, -367) });
    assert.equal(pendingDate(past, {}, TODAY), null);
  });

  test('a once task left overdue stays pending, beyond the lookback window', () => {
    const recent = makeTask({ type: 'once', startDate: '2026-10-01' }, { id: 'a', name: 'A' });
    const ancient = makeTask({ type: 'once', startDate: '2024-01-01' }, { id: 'b', name: 'B' });
    assert.deepEqual(sections([recent, ancient]).pending, [['a', '2026-10-01'], ['b', '2024-01-01']]);
  });

  test('a once task completed on an earlier day disappears', () => {
    const t = makeTask({ type: 'once', startDate: '2026-10-01' });
    assert.deepEqual(sections([t], { t1: { '2026-10-01': done('2026-10-03') } }), { todo: [], pending: [], done: [], missed: [] });
  });

  test('a quick task stays in TO DO on its day and moves to Pending after', () => {
    const t = makeTask({ type: 'once', startDate: TODAY }, { kind: 'quick' });
    assert.deepEqual(sections([t]).todo, [['t1', TODAY]]);
    assert.deepEqual(sections([t], {}, '2026-10-20').pending, [['t1', TODAY]]);
  });

  test('a pending task completed today lands in Done for its occurrence date', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-09-07' });
    const progress = { t1: { '2026-10-05': done(TODAY) } };
    assert.deepEqual(sections([t], progress), { todo: [], pending: [], done: [['t1', '2026-10-05']], missed: [] });
    // Tomorrow it is neither pending nor done.
    assert.deepEqual(sections([t], progress, '2026-10-09'), { todo: [], pending: [], done: [], missed: [] });
  });

  test('a pending once task completed today lands in Done', () => {
    const t = makeTask({ type: 'once', startDate: '2026-10-01' });
    assert.deepEqual(sections([t], { t1: { '2026-10-01': done(TODAY) } }).done, [['t1', '2026-10-01']]);
  });

  test('inactive tasks never appear', () => {
    const tasks = [
      makeTask({ type: 'daily', startDate: '2026-10-01' }, { id: 'a', active: false }),
      makeTask({ type: 'once', startDate: '2026-10-01' }, { id: 'b', active: false }),
      makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-09-07' }, { id: 'c', active: false }),
      makeTask({ type: 'daily', startDate: '2026-10-01' }, { id: 'd', active: false }),
    ];
    const progress = { d: { [TODAY]: done(TODAY) } };
    assert.deepEqual(sections(tasks, progress), { todo: [], pending: [], done: [], missed: [] });
  });

  test('each task appears once, sections are sorted by name', () => {
    const tasks = [
      makeTask({ type: 'daily', startDate: '2026-10-01' }, { id: 'z', name: 'zebra' }),
      makeTask({ type: 'daily', startDate: '2026-10-01' }, { id: 'a', name: 'Apple' }),
      makeTask({ type: 'daily', startDate: '2026-10-01' }, { id: 'm', name: 'mango' }),
      makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-09-07' }, { id: 'p', name: 'Pending one' }),
    ];
    const s = sections(tasks, { m: { [TODAY]: done(TODAY) } });
    assert.deepEqual(s, { todo: [['a', TODAY], ['z', TODAY]], pending: [['p', '2026-10-05']], done: [['m', TODAY]], missed: [] });
  });

  test('Not done today moves a task from TO DO to Not done, and only for today', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-01' });
    const progress = { t1: { [TODAY]: notDone(TODAY) } };
    assert.deepEqual(sections([t], progress), { todo: [], pending: [], done: [], missed: [['t1', TODAY]] });
    // Tomorrow the new occurrence is due again; the marked day is never pending.
    assert.deepEqual(sections([t], progress, '2026-10-09'), { todo: [['t1', '2026-10-09']], pending: [], done: [], missed: [] });
  });

  test('Not done on a pending occurrence dismisses it from Pending', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1], startDate: '2026-09-07' });
    const progress = { t1: { '2026-10-05': notDone(TODAY) } };
    assert.deepEqual(sections([t], progress), { todo: [], pending: [], done: [], missed: [['t1', '2026-10-05']] });
    assert.deepEqual(sections([t], progress, '2026-10-09'), { todo: [], pending: [], done: [], missed: [] });
    // Older missed occurrences behind it stay skipped.
    assert.equal(pendingDate(t, progress.t1, '2026-10-09'), null);
  });

  test('a once task marked not done leaves Pending for good', () => {
    const t = makeTask({ type: 'once', startDate: '2026-10-01' });
    const progress = { t1: { '2026-10-01': notDone('2026-10-03') } };
    assert.deepEqual(sections([t], progress), { todo: [], pending: [], done: [], missed: [] });
    assert.equal(pendingDate(t, progress.t1, TODAY), null);
  });

  test('due today: a pending occurrence dismissed earlier does not hide today', () => {
    const t = makeTask({ type: 'weekly', weekdays: [1, 4], startDate: '2026-09-07' });
    // Mon Oct 5 marked not done today; Thu Oct 8 (today) is due and untouched.
    assert.deepEqual(sections([t], { t1: { '2026-10-05': notDone(TODAY) } }).todo, [['t1', TODAY]]);
  });
});

// ---------------------------------------------------------------------------

describe('nextOccurrences', () => {
  test('starts from today when the start date is in the past', () => {
    const t = makeTask({ type: 'weekly', interval: 2, weekdays: [1, 4], startDate: '2026-10-05' });
    assert.deepEqual(nextOccurrences(t, TODAY, 5), ['2026-10-08', '2026-10-19', '2026-10-22', '2026-11-02', '2026-11-05']);
  });

  test('starts from the start date when it is in the future', () => {
    const t = makeTask({ type: 'daily', interval: 2, startDate: '2026-12-31' });
    assert.deepEqual(nextOccurrences(t, TODAY, 3), ['2026-12-31', '2027-01-02', '2027-01-04']);
  });

  test('monthly day 31 and yearly Feb 29', () => {
    const m = makeTask({ type: 'monthly', monthDays: [31], startDate: '2026-01-01' });
    assert.deepEqual(nextOccurrences(m, TODAY, 3), ['2026-10-31', '2026-11-30', '2026-12-31']);
    const y = makeTask({ type: 'yearly', yearDays: [{ month: 2, day: 29 }], startDate: '2026-01-01' });
    assert.deepEqual(nextOccurrences(y, TODAY, 3), ['2027-02-28', '2028-02-29', '2029-02-28']);
  });

  test('large intervals still resolve', () => {
    const y = makeTask({ type: 'yearly', interval: 50, yearDays: [{ month: 1, day: 1 }], startDate: '2000-01-01' });
    assert.deepEqual(nextOccurrences(y, TODAY, 2), ['2050-01-01', '2100-01-01']);
  });

  test('once: the start date if still ahead, otherwise nothing', () => {
    assert.deepEqual(nextOccurrences(makeTask({ type: 'once', startDate: TODAY }), TODAY), [TODAY]);
    assert.deepEqual(nextOccurrences(makeTask({ type: 'once', startDate: '2026-10-07' }), TODAY), []);
  });

  test('agrees with isDue day by day', () => {
    const t = makeTask({ type: 'monthly', interval: 2, monthDays: [5, 31], startDate: '2026-02-10' });
    assert.deepEqual(nextOccurrences(t, '2026-01-01', 8), dueBetween(t, '2026-01-01', '2027-06-30').slice(0, 8));
  });
});

describe('dueDatesBetween', () => {
  test('agrees with isDue for every recurrence type', () => {
    const tasks = [
      makeTask({ type: 'daily', interval: 3, startDate: '2026-09-02' }),
      makeTask({ type: 'weekly', interval: 2, weekdays: [1, 4], startDate: '2026-09-07' }),
      makeTask({ type: 'weekly', startDate: '2026-09-09' }),
      makeTask({ type: 'monthly', interval: 2, monthDays: [5, 31], startDate: '2026-02-10' }),
      makeTask({ type: 'yearly', yearDays: [{ month: 2, day: 29 }, { month: 10, day: 1 }], startDate: '2024-01-01' }),
    ];
    for (const t of tasks) {
      assert.deepEqual(dueDatesBetween(t, '2026-01-15', '2028-03-31'), dueBetween(t, '2026-01-15', '2028-03-31'), t.recurrence.type);
    }
  });

  test('a range that starts before the start date begins at the start date', () => {
    const t = makeTask({ type: 'daily', startDate: '2026-10-06' });
    assert.deepEqual(dueDatesBetween(t, '2026-10-01', TODAY), ['2026-10-06', '2026-10-07', '2026-10-08']);
  });

  test('once tasks, empty and inverted ranges', () => {
    const once = makeTask({ type: 'once', startDate: '2026-10-05' });
    assert.deepEqual(dueDatesBetween(once, '2026-10-01', TODAY), ['2026-10-05']);
    assert.deepEqual(dueDatesBetween(once, '2026-10-06', TODAY), []);
    assert.deepEqual(dueDatesBetween(makeTask({ type: 'daily' }), TODAY, '2026-10-07'), []);
    assert.deepEqual(dueDatesBetween(makeTask({ type: 'daily' }), 'nope', TODAY), []);
  });
});

describe('describeRecurrence', () => {
  const rec = (r) => makeTask(r).recurrence;
  test('summaries', () => {
    assert.equal(describeRecurrence(rec({ type: 'daily' }), TODAY), 'Daily');
    assert.equal(describeRecurrence(rec({ type: 'daily', interval: 3 }), TODAY), 'Every 3 days');
    assert.equal(describeRecurrence(rec({ type: 'weekly', interval: 2, weekdays: [4, 1] }), TODAY), 'Every 2 weeks · Mon, Thu');
    assert.equal(describeRecurrence(rec({ type: 'monthly', monthDays: [15, 1] }), TODAY), 'Monthly · 1, 15');
    assert.equal(
      describeRecurrence(rec({ type: 'yearly', yearDays: [{ month: 12, day: 25 }, { month: 3, day: 1 }] }), TODAY),
      'Yearly · Mar 1, Dec 25',
    );
    assert.equal(describeRecurrence(rec({ type: 'once', startDate: '2026-10-20' }), TODAY), 'Once · Oct 20');
    assert.equal(describeRecurrence(rec({ type: 'weekly', startDate: TODAY }), TODAY), 'Weekly · Thu');
    assert.equal(describeRecurrence(rec({ type: 'daily', startDate: '2026-11-01' }), TODAY), 'Daily · starts Nov 1');
  });
});

describe('checklistProgress', () => {
  test('counts only items still on the task', () => {
    const t = makeTask({}, { checklist: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }] });
    const occ = { checklist: { a: true, c: true, deleted: true }, completedAt: null };
    assert.deepEqual(checklistProgress(t, occ), { done: 2, total: 3 });
    assert.deepEqual(checklistProgress(t, undefined), { done: 0, total: 3 });
  });
});
