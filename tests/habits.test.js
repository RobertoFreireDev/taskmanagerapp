import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  xpForLevel, xpToReach, levelForXp, habitOutcomes, characterSummary, MOOD_PERIODS,
} from '../public/js/habits.js';
import { AVATARS, STATUSES, STATUS_GROUPS, statusesByGroup, isStatusKey } from '../public/js/statuses.js';

// 2026-10-08 is a Thursday. Week of Sun 2026-10-04 … Sat 2026-10-10.
const TODAY = '2026-10-08';
const ts = '2026-01-01T00:00:00.000Z';

/** ISO timestamp for local noon on a calendar day. */
function at(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

/** Progress map with these dates completed. */
const doneOn = (...dates) => Object.fromEntries(dates.map((d) => [d, { checklist: {}, completedAt: at(d), missedAt: null }]));

/** Progress map with these dates marked Not done (on the day itself). */
const notDoneOn = (...dates) => Object.fromEntries(dates.map((d) => [d, { checklist: {}, completedAt: null, missedAt: at(d) }]));

function makeTask(id, recurrence, extra = {}) {
  return {
    id, kind: 'regular', icon: 'task', name: id, active: true, notes: [], checklist: [], createdAt: ts, updatedAt: ts, ...extra,
    recurrence: { type: 'daily', interval: 1, weekdays: [], monthDays: [], yearDays: [], startDate: '2026-09-01', ...recurrence },
  };
}

function makeHabit(taskId, extra = {}) {
  return {
    id: `h-${taskId}`, taskId, since: '2026-10-01', done: { xp: 10, status: null }, missed: { xp: 5, status: null }, ...extra,
  };
}

function makeCharacter(habits, extra = {}) {
  return {
    id: 'rex', avatar: 'dog', name: 'Rex', leveling: { base: 100, step: 50 }, mood: { period: 'week', happyMax: 0, sadMin: 3 },
    habits, createdAt: ts, updatedAt: ts, ...extra,
  };
}

const summary = (tasks, progress, habits, extra, today = TODAY) =>
  characterSummary({ tasks, progress }, makeCharacter(habits, extra), today);

const outcomes = (task, progress, habit, today = TODAY) =>
  habitOutcomes(task, progress, habit, today).map(({ date, outcome }) => `${date} ${outcome}`);

// ---------------------------------------------------------------------------

describe('level curve', () => {
  const curve = { base: 100, step: 50 };

  test('each level needs `step` more XP than the one before', () => {
    assert.deepEqual([1, 2, 3, 4].map((l) => xpForLevel(l, curve)), [100, 150, 200, 250]);
    assert.deepEqual([1, 2, 3, 5].map((l) => xpToReach(l, curve)), [0, 100, 250, 700]);
  });

  test('levels for XP totals', () => {
    assert.deepEqual(levelForXp(0, curve), { level: 1, into: 0, needed: 100 });
    assert.deepEqual(levelForXp(99, curve), { level: 1, into: 99, needed: 100 });
    assert.deepEqual(levelForXp(100, curve), { level: 2, into: 0, needed: 150 });
    assert.deepEqual(levelForXp(249, curve), { level: 2, into: 149, needed: 150 });
    assert.deepEqual(levelForXp(250, curve), { level: 3, into: 0, needed: 200 });
    assert.deepEqual(levelForXp(700, curve), { level: 5, into: 0, needed: 300 });
    assert.deepEqual(levelForXp(-20, curve), { level: 1, into: 0, needed: 100 });
  });

  test('step 0 is a flat curve', () => {
    assert.deepEqual(levelForXp(95, { base: 10, step: 0 }), { level: 10, into: 5, needed: 10 });
  });

  test('matches the definition for many totals and curves, and stays fast for huge totals', () => {
    for (const c of [curve, { base: 1, step: 0 }, { base: 1, step: 1 }, { base: 7, step: 99 }, { base: 1, step: 99999 }]) {
      for (let xp = 0; xp <= 3000; xp += 7) {
        const { level, into, needed } = levelForXp(xp, c);
        assert.ok(xpToReach(level, c) <= xp && xp < xpToReach(level + 1, c), `${xp} XP with ${JSON.stringify(c)}`);
        assert.equal(into, xp - xpToReach(level, c));
        assert.equal(needed, xpForLevel(level, c));
      }
    }
    assert.equal(levelForXp(1e12, { base: 1, step: 0 }).level, 1e12 + 1);
    const big = levelForXp(1e12, curve);
    assert.ok(xpToReach(big.level, curve) <= 1e12 && 1e12 < xpToReach(big.level + 1, curve));
  });
});

describe('habit outcomes', () => {
  test('done and missed days from `since`; today is never missed', () => {
    const t = makeTask('walk', {});
    const progress = doneOn('2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05');
    assert.deepEqual(outcomes(t, progress, makeHabit('walk')), [
      '2026-10-01 done', '2026-10-02 done', '2026-10-03 missed', '2026-10-04 missed',
      '2026-10-05 done', '2026-10-06 missed', '2026-10-07 missed',
    ]);
    assert.deepEqual(outcomes(t, { ...progress, ...doneOn(TODAY) }, makeHabit('walk')).at(-1), `${TODAY} done`);
  });

  test('counts from the later of `since` and the task start', () => {
    const t = makeTask('walk', { startDate: '2026-10-06' });
    assert.deepEqual(outcomes(t, {}, makeHabit('walk')), ['2026-10-06 missed', '2026-10-07 missed']);
    assert.deepEqual(outcomes(t, {}, makeHabit('walk', { since: '2026-10-09' })), []);
  });

  test('a pending occurrence completed later turns into done; undo turns it back', () => {
    const t = makeTask('gym', { type: 'weekly', weekdays: [1], startDate: '2026-09-07' });
    const habit = makeHabit('gym');
    assert.deepEqual(outcomes(t, {}, habit), ['2026-10-05 missed']);
    const late = { '2026-10-05': { checklist: {}, completedAt: at(TODAY) } };
    assert.deepEqual(outcomes(t, late, habit), ['2026-10-05 done']);
    assert.deepEqual(outcomes(t, {}, habit), ['2026-10-05 missed']);
  });

  test('a completion on a date that is no longer due still counts', () => {
    const t = makeTask('gym', { type: 'weekly', weekdays: [1], startDate: '2026-09-07' });
    assert.deepEqual(outcomes(t, doneOn('2026-10-06'), makeHabit('gym')), ['2026-10-05 missed', '2026-10-06 done']);
  });

  test('inactive tasks never miss, but their completions count', () => {
    const t = makeTask('walk', {}, { active: false });
    assert.deepEqual(outcomes(t, doneOn('2026-10-02'), makeHabit('walk')), ['2026-10-02 done']);
  });

  test('an overdue once task is one miss until completed', () => {
    const t = makeTask('call', { type: 'once', startDate: '2026-10-03' });
    assert.deepEqual(outcomes(t, {}, makeHabit('call')), ['2026-10-03 missed']);
    assert.deepEqual(outcomes(t, { '2026-10-03': { checklist: {}, completedAt: at(TODAY) } }, makeHabit('call')), ['2026-10-03 done']);
  });

  test('Not done counts as missed at once, today included, and Undo takes it back', () => {
    const t = makeTask('walk', { startDate: '2026-10-06' });
    assert.deepEqual(outcomes(t, notDoneOn(TODAY), makeHabit('walk')), ['2026-10-06 missed', '2026-10-07 missed', `${TODAY} missed`]);
    assert.deepEqual(outcomes(t, {}, makeHabit('walk')), ['2026-10-06 missed', '2026-10-07 missed']);
  });

  test('Not done on an inactive task still counts; before `since` it does not', () => {
    const t = makeTask('walk', {}, { active: false });
    assert.deepEqual(outcomes(t, notDoneOn('2026-09-30', '2026-10-02'), makeHabit('walk')), ['2026-10-02 missed']);
  });

  test('weekly every 2 weeks only misses on its weeks', () => {
    const t = makeTask('mow', { type: 'weekly', interval: 2, weekdays: [1, 4], startDate: '2026-09-07' });
    assert.deepEqual(outcomes(t, {}, makeHabit('mow', { since: '2026-09-20' })), [
      '2026-09-21 missed', '2026-09-24 missed', '2026-10-05 missed',
    ]);
  });
});

describe('character XP', () => {
  test('sums gains and losses in date order', () => {
    const tasks = [makeTask('walk', {})];
    const progress = { walk: doneOn('2026-10-01', '2026-10-02', '2026-10-05', TODAY) };
    // +10 +10 −5 −5 +10 −5 −5 +10
    assert.equal(summary(tasks, progress, [makeHabit('walk')]).xp, 20);
    progress.walk = doneOn('2026-10-01', '2026-10-02', '2026-10-05');
    assert.equal(summary(tasks, progress, [makeHabit('walk')]).xp, 10);
  });

  test('never drops below 0, so early misses build no debt', () => {
    const tasks = [makeTask('walk', {})];
    const s = summary(tasks, { walk: doneOn('2026-10-07') }, [makeHabit('walk')]);
    assert.equal(s.xp, 10); // six misses floor at 0, then +10
    assert.deepEqual({ level: s.level, into: s.into, needed: s.needed }, { level: 1, into: 10, needed: 100 });
  });

  test('habits on the same day net out before the floor applies', () => {
    const tasks = [makeTask('a', { type: 'once', startDate: '2026-10-03' }), makeTask('b', { type: 'once', startDate: '2026-10-03' })];
    const habits = [makeHabit('a', { done: { xp: 10, status: null } }), makeHabit('b', { missed: { xp: 4, status: null } })];
    assert.equal(summary(tasks, { a: doneOn('2026-10-03') }, habits).xp, 6);
  });

  test('levels can go down when XP is lost', () => {
    const tasks = [makeTask('walk', {})];
    const habit = makeHabit('walk', { done: { xp: 100, status: null }, missed: { xp: 30, status: null } });
    assert.equal(summary(tasks, { walk: doneOn('2026-10-01', '2026-10-02') }, [habit], {}, '2026-10-03').level, 2);
    // 200 XP, then four misses of 30: 80 XP.
    assert.equal(summary(tasks, { walk: doneOn('2026-10-01', '2026-10-02') }, [habit], {}, '2026-10-07').level, 1);
  });

  test('habits for tasks that are gone are skipped', () => {
    const s = summary([], {}, [makeHabit('ghost')]);
    assert.equal(s.xp, 0);
    assert.deepEqual(s.habits, []);
  });
});

describe('character mood', () => {
  const tasks = [makeTask('walk', {})];

  test('thresholds: happy at or under happyMax, sad at or over sadMin, normal between', () => {
    const misses = (n) => {
      // Complete every day of the week except the last n.
      const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
      return { walk: doneOn(...days.slice(0, 7 - n)) };
    };
    assert.equal(summary(tasks, misses(0), [makeHabit('walk')]).mood, 'happy');
    assert.equal(summary(tasks, misses(1), [makeHabit('walk')]).mood, 'normal');
    assert.equal(summary(tasks, misses(2), [makeHabit('walk')]).mood, 'normal');
    assert.equal(summary(tasks, misses(3), [makeHabit('walk')]).mood, 'sad');
    assert.equal(summary(tasks, misses(2), [makeHabit('walk')], { mood: { period: 'week', happyMax: 2, sadMin: 5 } }).mood, 'happy');
    assert.equal(summary(tasks, misses(2), [makeHabit('walk')]).missed, 2);
  });

  test('each period counts misses in the N days before today, never today', () => {
    const once = (date) => makeTask(date, { type: 'once', startDate: date });
    const habitFor = (date) => makeHabit(date, { since: '2025-01-01' });
    const missesIn = (period, dates) =>
      summary(dates.map(once), {}, dates.map(habitFor), { mood: { period, happyMax: 0, sadMin: 3 } }).missed;

    assert.equal(MOOD_PERIODS.week, 7);
    assert.equal(missesIn('day', ['2026-10-07', '2026-10-06']), 1);
    assert.equal(missesIn('week', ['2026-10-01', '2026-09-30']), 1);
    assert.equal(missesIn('month', ['2026-09-08', '2026-09-07']), 1);
    assert.equal(missesIn('year', ['2025-10-08', '2025-10-07']), 1);
    assert.equal(missesIn('week', [TODAY]), 0); // due today, not done yet: not a miss
    assert.equal(summary([], {}, []).mood, 'happy');
  });

  test('Not done today counts toward the mood right away, for every period', () => {
    const t = [makeTask('call', { type: 'once', startDate: TODAY })];
    const habit = [makeHabit('call')];
    for (const period of Object.keys(MOOD_PERIODS)) {
      const s = summary(t, { call: notDoneOn(TODAY) }, habit, { mood: { period, happyMax: 0, sadMin: 1 } });
      assert.deepEqual([s.missed, s.mood], [1, 'sad'], period);
    }
  });
});

describe('Not done', () => {
  test('costs XP and sets the missed status the moment it is marked', () => {
    const tasks = [makeTask('gym', { startDate: TODAY })];
    const habit = makeHabit('gym', { since: TODAY, done: { xp: 10, status: 'strong' }, missed: { xp: 5, status: 'weak' } });
    const before = summary(tasks, { gym: doneOn(TODAY) }, [habit]);
    assert.deepEqual([before.xp, before.statuses], [10, ['strong']]);
    const after = summary(tasks, { gym: notDoneOn(TODAY) }, [habit]);
    assert.deepEqual([after.xp, after.statuses, after.habits[0].last], [0, ['weak'], { date: TODAY, outcome: 'missed' }]);
    const untouched = summary(tasks, {}, [habit]);
    assert.deepEqual([untouched.xp, untouched.statuses, untouched.habits[0].last], [0, [], null]);
  });

  test('takes XP from what was earned before', () => {
    const tasks = [makeTask('gym', { startDate: '2026-10-06' })];
    const progress = { gym: { ...doneOn('2026-10-06', '2026-10-07'), ...notDoneOn(TODAY) } };
    assert.equal(summary(tasks, progress, [makeHabit('gym')]).xp, 15);
  });
});

describe('character statuses', () => {
  const strongWeak = (taskId, extra = {}) =>
    makeHabit(taskId, { done: { xp: 10, status: 'strong' }, missed: { xp: 5, status: 'weak' }, ...extra });

  test('each habit shows the status of its latest result', () => {
    const tasks = [makeTask('gym', {})];
    assert.deepEqual(summary(tasks, { gym: doneOn('2026-10-07') }, [strongWeak('gym')]).statuses, ['strong']);
    assert.deepEqual(summary(tasks, { gym: doneOn('2026-10-06') }, [strongWeak('gym')]).statuses, ['weak']);
    // Done today beats yesterday's miss.
    assert.deepEqual(summary(tasks, { gym: doneOn(TODAY) }, [strongWeak('gym')]).statuses, ['strong']);
  });

  test('skips empty statuses, duplicates, the mood key, inactive tasks and habits with no results', () => {
    const tasks = [
      makeTask('a', {}), makeTask('b', {}), makeTask('c', {}), makeTask('d', {}, { active: false }),
      makeTask('e', { startDate: TODAY }), makeTask('f', {}),
    ];
    const progress = { a: doneOn('2026-10-07'), b: doneOn('2026-10-07'), c: doneOn('2026-10-07'), d: doneOn('2026-10-07'), f: doneOn('2026-10-07') };
    const habits = [
      strongWeak('a'),
      strongWeak('b'),
      makeHabit('c', { done: { xp: 1, status: null } }),
      makeHabit('d', { done: { xp: 1, status: 'rich' } }),
      makeHabit('e', { missed: { xp: 1, status: 'hungry' } }),
      makeHabit('f', { done: { xp: 1, status: 'sad' } }),
    ];
    const s = summary(tasks, progress, habits, { mood: { period: 'week', happyMax: 99, sadMin: 100 } });
    assert.equal(s.mood, 'happy');
    assert.deepEqual(s.statuses, ['strong', 'sad']);
    const moodSad = summary(tasks, progress, habits, { mood: { period: 'week', happyMax: 0, sadMin: 1 } });
    assert.equal(moodSad.mood, 'sad');
    assert.deepEqual(moodSad.statuses, ['strong']); // 'sad' is the mood itself
  });

  test('habits come back sorted by task name with their latest result', () => {
    const tasks = [makeTask('b', {}, { name: 'Zumba' }), makeTask('a', {}, { name: 'aerobics' })];
    const s = summary(tasks, { b: doneOn('2026-10-07') }, [makeHabit('b'), makeHabit('a')]);
    assert.deepEqual(s.habits.map((x) => x.task.name), ['aerobics', 'Zumba']);
    assert.deepEqual(s.habits.map((x) => x.last), [{ date: '2026-10-07', outcome: 'missed' }, { date: '2026-10-07', outcome: 'done' }]);
  });
});

describe('avatars and statuses', () => {
  const singleEmoji = (e) => [...e].length === 1 && !e.includes('‍') && !e.includes('️');

  test('six avatars, each a single emoji', () => {
    assert.deepEqual(Object.keys(AVATARS), ['kid', 'woman', 'man', 'cat', 'dog', 'bird']);
    assert.ok(Object.values(AVATARS).every((a) => a.label && singleEmoji(a.emoji)));
  });

  test('64 statuses with unique single-code-point emoji, eight per group', () => {
    const keys = Object.keys(STATUSES);
    assert.equal(keys.length, 64);
    assert.equal(new Set(keys.map((k) => STATUSES[k].emoji)).size, 64);
    for (const k of keys) {
      assert.ok(STATUSES[k].label, k);
      assert.ok(singleEmoji(STATUSES[k].emoji), k);
      assert.ok(Object.hasOwn(STATUS_GROUPS, STATUSES[k].group), k);
    }
    assert.deepEqual(statusesByGroup().map((g) => g.statuses.length), Array(8).fill(8));
  });

  test('includes the statuses asked for, and one per mood', () => {
    const wanted = ['rich', 'poor', 'weak', 'normal', 'strong', 'sleepy', 'hungry', 'happy', 'sad', 'tired', 'overwhelmed', 'busy', 'free'];
    assert.deepEqual(wanted.filter((k) => !isStatusKey(k)), []);
  });
});
