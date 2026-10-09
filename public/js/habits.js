/*
 * Habit characters: XP, levels, mood and statuses. Pure: no DOM, no storage,
 * no clock. Callers pass `today`. Covered by tests/habits.test.js.
 *
 * Nothing here is stored. XP is always recalculated from task progress, so
 * edits, Undo, late completions and imports stay consistent on their own.
 */

import { addDays, isValidKey } from './dates.js';
import { dueDatesBetween } from './schedule.js';

/** The rolling window, in days before today, that a mood counts misses over (plus today's Not done marks). */
export const MOOD_PERIODS = { day: 1, week: 7, month: 30, year: 365 };
export const MOODS = ['happy', 'normal', 'sad'];

export const HABIT_XP_MAX = 9999;
export const LEVEL_XP_MAX = 99999;
export const MISSED_MAX = 999;

export const DEFAULT_LEVELING = { base: 100, step: 50 };
export const DEFAULT_MOOD = { period: 'week', happyMax: 0, sadMin: 3 };
export const DEFAULT_HABIT = { done: { xp: 10, status: null }, missed: { xp: 5, status: null } };

// ---------------------------------------------------------------------------
// Levels: level 2 needs `base` XP, and each later level needs `step` more
// than the one before (100, 150, 200, … for base 100, step 50).

/** XP needed to go from `level` to the next one. */
export function xpForLevel(level, { base, step }) {
  return base + (level - 1) * step;
}

/** Total XP needed to reach `level` from level 1. */
export function xpToReach(level, { base, step }) {
  const n = level - 1;
  return n * base + (step * n * (n - 1)) / 2;
}

/** { level, into, needed }: the level for a total, XP into it, and XP the next level needs. */
export function levelForXp(xp, leveling) {
  const { base, step } = leveling;
  const total = Math.max(0, Math.floor(xp));
  // Solve xpToReach(n + 1) <= total for the largest n, then fix float rounding.
  let n;
  if (step === 0) {
    n = Math.floor(total / base);
  } else {
    const a = step / 2;
    const b = base - step / 2;
    n = Math.max(0, Math.floor((-b + Math.sqrt(b * b + 4 * a * total)) / (2 * a)));
  }
  while (n > 0 && xpToReach(n + 1, leveling) > total) n--;
  while (xpToReach(n + 2, leveling) <= total) n++;
  const level = n + 1;
  return { level, into: total - xpToReach(level, leveling), needed: xpForLevel(level, leveling) };
}

// ---------------------------------------------------------------------------
// Outcomes

/**
 * A habit's results, oldest first: [{ date, outcome: 'done' | 'missed' }].
 * - done: every completed occurrence on or after `since`, due or not, so a
 *   recurrence edit never takes back XP already earned;
 * - missed: every occurrence marked Not done on or after `since` (today
 *   included), plus every due date from `since` (or the task's start) up to
 *   yesterday that was neither completed nor marked. An unmarked today is
 *   never missed: the day isn't over.
 * Inactive tasks never miss on their own: they are hidden from Home.
 */
export function habitOutcomes(task, progress, habit, today) {
  const rec = task?.recurrence;
  if (!rec || !isValidKey(habit?.since) || !isValidKey(today)) return [];
  const results = new Map();
  for (const [date, occ] of Object.entries(progress ?? {})) {
    if (date < habit.since || date > today) continue;
    if (occ?.completedAt) results.set(date, 'done');
    else if (occ?.missedAt) results.set(date, 'missed');
  }
  if (task.active === true && isValidKey(rec.startDate)) {
    const from = habit.since > rec.startDate ? habit.since : rec.startDate;
    for (const date of dueDatesBetween(task, from, addDays(today, -1))) {
      if (!results.has(date)) results.set(date, 'missed');
    }
  }
  return [...results.keys()].sort().map((date) => ({ date, outcome: results.get(date) }));
}

const byTaskName = (a, b) => a.task.name.localeCompare(b.task.name, undefined, { sensitivity: 'base' });

/**
 * Everything a character card shows:
 * { xp, level, into, needed, mood, missed, periodDays, statuses, habits }.
 * - xp: per-day deltas in date order; the total never drops below 0, so early
 *   misses build no debt. Levels can go down.
 * - mood: 'happy' | 'normal' | 'sad' from misses in the periodDays days
 *   before today, plus today's Not done marks.
 * - statuses: the status each active habit's latest result sets, without
 *   duplicates or the mood's own key.
 * - habits: [{ habit, task, last }] sorted by task name; last is the latest
 *   outcome or null. Habits whose task is gone are skipped.
 */
export function characterSummary(state, character, today) {
  const leveling = character.leveling ?? DEFAULT_LEVELING;
  const moodRule = character.mood ?? DEFAULT_MOOD;
  const periodDays = MOOD_PERIODS[moodRule.period] ?? MOOD_PERIODS.week;
  const windowStart = addDays(today, -periodDays);
  const tasks = new Map((state.tasks ?? []).map((t) => [t.id, t]));

  const deltas = new Map();
  let missed = 0;
  const habits = [];
  for (const habit of character.habits ?? []) {
    const task = tasks.get(habit.taskId);
    if (!task) continue;
    const outcomes = habitOutcomes(task, state.progress?.[task.id], habit, today);
    for (const { date, outcome } of outcomes) {
      const delta = outcome === 'done' ? habit.done.xp : -habit.missed.xp;
      deltas.set(date, (deltas.get(date) ?? 0) + delta);
      if (outcome === 'missed' && date >= windowStart) missed++;
    }
    habits.push({ habit, task, last: outcomes.at(-1) ?? null });
  }
  habits.sort(byTaskName);

  let xp = 0;
  for (const date of [...deltas.keys()].sort()) xp = Math.max(0, xp + deltas.get(date));

  const mood = missed <= moodRule.happyMax ? 'happy' : missed >= moodRule.sadMin ? 'sad' : 'normal';

  const statuses = [];
  for (const { habit, task, last } of habits) {
    const status = last && task.active ? habit[last.outcome].status : null;
    if (status && status !== mood && !statuses.includes(status)) statuses.push(status);
  }

  return { xp, ...levelForXp(xp, leveling), mood, missed, periodDays, statuses, habits };
}
