/*
 * App state: load, migrate, normalize and save. One localStorage key holds
 * everything. Every mutation saves immediately and notifies subscribers.
 */

import { isValidKey, isoToLocalKey } from './dates.js';
import { RECURRENCE_TYPES } from './schedule.js';
import { DEFAULT_ICON, isIconKey } from './icons.js';
import { MAX_EMOTIONS, isEmotionKey, isEnergyLevel } from './moods.js';
import { DEFAULT_AVATAR, isAvatarKey, isStatusKey } from './statuses.js';
import {
  MOOD_PERIODS, DEFAULT_LEVELING, DEFAULT_MOOD, DEFAULT_HABIT, HABIT_XP_MAX, LEVEL_XP_MAX, MISSED_MAX,
} from './habits.js';

export const STORAGE_KEY = 'taskmanager.state';
export const LAST_EXPORT_KEY = 'taskmanager.lastExport';
export const CORRUPT_KEY = 'taskmanager.state.corrupt';
export const SCHEMA_VERSION = 4;
export const NAME_MAX = 80;
export const TEXT_MAX = 2000;
export const JOURNAL_TEXT_MAX = 20000;

/** Thrown for data that cannot be loaded or imported. The message is shown to the user. */
export class DataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataError';
  }
}

/**
 * Upgrades from schema N to N+1, keyed by N. When the schema changes, bump
 * SCHEMA_VERSION and add a step here. Never remove a step: old export files
 * must keep importing.
 */
const MIGRATIONS = {
  // 1 → 2: standalone checklists.
  1: (data) => ({ ...data, schemaVersion: 2, checklists: [] }),
  // 2 → 3: daily journal.
  2: (data) => ({ ...data, schemaVersion: 3, journal: {} }),
  // 3 → 4: habit characters.
  3: (data) => ({ ...data, schemaVersion: 4, characters: [] }),
};

export function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, tasks: [], progress: {}, checklists: [], journal: {}, characters: [] };
}

/** Brings raw parsed data up to the current schema and normalizes it. Throws DataError. */
export function migrate(raw) {
  if (!isPlainObject(raw)) throw new DataError('The data is not an object.');
  let version = raw.schemaVersion;
  if (!Number.isInteger(version) || version < 1) throw new DataError('The data has no valid schemaVersion.');
  if (version > SCHEMA_VERSION) {
    throw new DataError(`The data was made by a newer version of the app (schema ${version}). Update the app first.`);
  }
  let data = raw;
  for (; version < SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) throw new DataError(`No migration from schema ${version}.`);
    data = step(data);
  }
  return normalizeState(data);
}

function normalizeState(data) {
  if (!Array.isArray(data.tasks)) throw new DataError('"tasks" must be a list.');
  const ids = new Set();
  const tasks = data.tasks.map((raw, i) => {
    const task = normalizeTask(raw, i);
    if (ids.has(task.id)) throw new DataError(`Two tasks share the id "${task.id}".`);
    ids.add(task.id);
    return task;
  });

  const rawProgress = data.progress ?? {};
  if (!isPlainObject(rawProgress)) throw new DataError('"progress" must be an object.');
  const progress = {};
  for (const [taskId, occurrences] of Object.entries(rawProgress)) {
    if (!ids.has(taskId) || !isPlainObject(occurrences)) continue; // unknown task: drop
    const out = {};
    for (const [date, occ] of Object.entries(occurrences)) {
      if (!isValidKey(date)) throw new DataError(`Progress has an invalid date "${date}".`);
      const normalized = normalizeOccurrence(occ);
      if (normalized) out[date] = normalized;
    }
    if (Object.keys(out).length) progress[taskId] = out;
  }

  const rawLists = data.checklists ?? [];
  if (!Array.isArray(rawLists)) throw new DataError('"checklists" must be a list.');
  const listIds = new Set();
  const checklists = rawLists.map((raw, i) => {
    const list = normalizeList(raw, i);
    if (listIds.has(list.id)) throw new DataError(`Two checklists share the id "${list.id}".`);
    listIds.add(list.id);
    return list;
  });

  const journal = normalizeJournal(data.journal ?? {});

  const rawCharacters = data.characters ?? [];
  if (!Array.isArray(rawCharacters)) throw new DataError('"characters" must be a list.');
  const characterIds = new Set();
  const characters = rawCharacters.map((raw, i) => {
    const character = normalizeCharacter(raw, i, ids);
    if (characterIds.has(character.id)) throw new DataError(`Two characters share the id "${character.id}".`);
    characterIds.add(character.id);
    return character;
  });

  return { schemaVersion: SCHEMA_VERSION, tasks, progress, checklists, journal, characters };
}

/** A habit character. Habits for unknown tasks, or for a task already attached, are dropped. */
function normalizeCharacter(c, i, taskIds) {
  const where = `Character ${i + 1}`;
  if (!isPlainObject(c)) throw new DataError(`${where} is not an object.`);
  const id = cleanId(c.id);
  if (!id) throw new DataError(`${where} has no id.`);
  const name = cleanText(c.name, NAME_MAX);
  if (!name) throw new DataError(`${where} has no name.`);
  const createdAt = isTimestamp(c.createdAt) ? c.createdAt : new Date().toISOString();

  const leveling = isPlainObject(c.leveling) ? c.leveling : {};
  const mood = isPlainObject(c.mood) ? c.mood : {};
  const happyMax = clampInt(mood.happyMax, 0, MISSED_MAX - 1, DEFAULT_MOOD.happyMax);
  const sadMin = clampInt(mood.sadMin, 1, MISSED_MAX, DEFAULT_MOOD.sadMin);

  const habits = [];
  const habitIds = new Set();
  const linked = new Set();
  for (const raw of Array.isArray(c.habits) ? c.habits : []) {
    const habit = normalizeHabit(raw, `"${name}"`);
    if (!habit || !taskIds.has(habit.taskId) || linked.has(habit.taskId)) continue;
    if (habitIds.has(habit.id)) habit.id = newId();
    habitIds.add(habit.id);
    linked.add(habit.taskId);
    habits.push(habit);
  }

  return {
    id,
    avatar: isAvatarKey(c.avatar) ? c.avatar : DEFAULT_AVATAR,
    name,
    leveling: {
      base: clampInt(leveling.base, 1, LEVEL_XP_MAX, DEFAULT_LEVELING.base),
      step: clampInt(leveling.step, 0, LEVEL_XP_MAX, DEFAULT_LEVELING.step),
    },
    mood: {
      period: Object.hasOwn(MOOD_PERIODS, mood.period) ? mood.period : DEFAULT_MOOD.period,
      happyMax,
      sadMin: sadMin > happyMax ? sadMin : happyMax + 1,
    },
    habits,
    createdAt,
    updatedAt: isTimestamp(c.updatedAt) ? c.updatedAt : createdAt,
  };
}

/** A task attached to a character, with what completing or missing it does. */
function normalizeHabit(h, where) {
  if (!isPlainObject(h)) return null;
  const taskId = cleanId(h.taskId);
  if (!taskId) return null;
  if (!isValidKey(h.since)) throw new DataError(`Character ${where} has a habit with an invalid date.`);
  const outcome = (o, fallback) => ({
    xp: clampInt(isPlainObject(o) ? o.xp : undefined, 0, HABIT_XP_MAX, fallback.xp),
    status: isPlainObject(o) && isStatusKey(o.status) ? o.status : null,
  });
  return {
    id: typeof h.id === 'string' && h.id ? h.id : newId(),
    taskId,
    since: h.since,
    done: outcome(h.done, DEFAULT_HABIT.done),
    missed: outcome(h.missed, DEFAULT_HABIT.missed),
  };
}

/** A whole number clamped to [min, max]; anything that isn't a number becomes `fallback`. */
function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** Journal entries keyed by local date. Entries that record nothing are dropped. */
function normalizeJournal(raw) {
  if (!isPlainObject(raw)) throw new DataError('"journal" must be an object.');
  const out = {};
  for (const [date, entry] of Object.entries(raw)) {
    if (!isValidKey(date)) throw new DataError(`Journal has an invalid date "${date}".`);
    const normalized = normalizeEntry(entry);
    if (normalized) out[date] = normalized;
  }
  return out;
}

function normalizeEntry(e) {
  if (!isPlainObject(e)) return null;
  const text = cleanText(e.text, JOURNAL_TEXT_MAX);
  const emotions = Array.isArray(e.emotions) ? [...new Set(e.emotions.filter(isEmotionKey))].slice(0, MAX_EMOTIONS) : [];
  const energy = isEnergyLevel(e.energy) ? e.energy : null;
  if (!text && !emotions.length && energy === null) return null;
  const createdAt = isTimestamp(e.createdAt) ? e.createdAt : new Date().toISOString();
  return { text, emotions, energy, createdAt, updatedAt: isTimestamp(e.updatedAt) ? e.updatedAt : createdAt };
}

function normalizeTask(t, i) {
  const where = `Task ${i + 1}`;
  if (!isPlainObject(t)) throw new DataError(`${where} is not an object.`);
  const id = cleanId(t.id);
  if (!id) throw new DataError(`${where} has no id.`);
  const name = cleanText(t.name, NAME_MAX);
  if (!name) throw new DataError(`${where} has no name.`);
  const now = new Date().toISOString();
  const createdAt = isTimestamp(t.createdAt) ? t.createdAt : now;
  return {
    id,
    kind: t.kind === 'quick' ? 'quick' : 'regular',
    icon: isIconKey(t.icon) ? t.icon : DEFAULT_ICON,
    name,
    active: t.active !== false,
    notes: Array.isArray(t.notes) ? t.notes.map((n) => cleanText(n, TEXT_MAX)).filter(Boolean) : [],
    checklist: normalizeChecklist(t.checklist),
    recurrence: normalizeRecurrence(t.recurrence, `"${name}"`),
    createdAt,
    updatedAt: isTimestamp(t.updatedAt) ? t.updatedAt : createdAt,
  };
}

/** Checklist rows as { id, text }; standalone checklists also keep `checked`. */
function normalizeChecklist(list, { withChecked = false } = {}) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const text = cleanText(isPlainObject(item) ? item.text : item, TEXT_MAX);
    if (!text) continue;
    let id = isPlainObject(item) && typeof item.id === 'string' && item.id ? item.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push(withChecked ? { id, text, checked: isPlainObject(item) && item.checked === true } : { id, text });
  }
  return out;
}

/** A standalone checklist: no dates, no completion, just items to tick. */
function normalizeList(l, i) {
  const where = `Checklist ${i + 1}`;
  if (!isPlainObject(l)) throw new DataError(`${where} is not an object.`);
  const id = cleanId(l.id);
  if (!id) throw new DataError(`${where} has no id.`);
  const name = cleanText(l.name, NAME_MAX);
  if (!name) throw new DataError(`${where} has no name.`);
  const createdAt = isTimestamp(l.createdAt) ? l.createdAt : new Date().toISOString();
  return {
    id,
    icon: isIconKey(l.icon) ? l.icon : DEFAULT_ICON,
    name,
    items: normalizeChecklist(l.items, { withChecked: true }),
    createdAt,
    updatedAt: isTimestamp(l.updatedAt) ? l.updatedAt : createdAt,
  };
}

function normalizeRecurrence(r, where) {
  if (!isPlainObject(r)) throw new DataError(`Task ${where} has no recurrence.`);
  if (!RECURRENCE_TYPES.includes(r.type)) throw new DataError(`Task ${where} has an invalid recurrence type.`);
  if (!isValidKey(r.startDate)) throw new DataError(`Task ${where} has an invalid start date.`);
  const n = Math.floor(Number(r.interval));
  return {
    type: r.type,
    interval: Number.isFinite(n) && n >= 1 ? n : 1,
    weekdays: uniqueInts(r.weekdays, 0, 6),
    monthDays: uniqueInts(r.monthDays, 1, 31),
    yearDays: normalizeYearDays(r.yearDays),
    startDate: r.startDate,
  };
}

/** Longest day each month can have (Feb 29 is allowed; it falls back in non-leap years). */
export const MAX_DAY_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function normalizeYearDays(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!isPlainObject(e)) continue;
    const { month, day } = e;
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    if (!Number.isInteger(day) || day < 1 || day > MAX_DAY_IN_MONTH[month - 1]) continue;
    const key = month * 100 + day;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ month, day });
  }
  return out.sort((a, b) => a.month - b.month || a.day - b.day);
}

function normalizeOccurrence(occ) {
  if (!isPlainObject(occ)) return null;
  const checklist = {};
  if (isPlainObject(occ.checklist)) {
    for (const [id, checked] of Object.entries(occ.checklist)) if (checked === true) checklist[id] = true;
  }
  const completedAt = isTimestamp(occ.completedAt) ? occ.completedAt : null;
  // Done and Not done are exclusive; a completion wins.
  const missedAt = !completedAt && isTimestamp(occ.missedAt) ? occ.missedAt : null;
  if (!completedAt && !missedAt && !Object.keys(checklist).length) return null; // nothing recorded
  return { checklist, completedAt, missedAt };
}

function uniqueInts(list, min, max) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((n) => Number.isInteger(n) && n >= min && n <= max))].sort((a, b) => a - b);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanId(value) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function isTimestamp(value) {
  return typeof value === 'string' && isoToLocalKey(value) !== null;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Random id. crypto.randomUUID() needs a secure context, so fall back to getRandomValues. */
export function newId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* insecure context in some browsers: fall through */
    }
  }
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Live state

let state = emptyState();
let firstRun = false;
let loadError = null;
let saveErrorHandler = null;
const listeners = new Set();

/** Reads state from localStorage. Unreadable data is kept under CORRUPT_KEY, never silently lost. */
export function init() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    loadError = err;
  }
  if (raw == null) {
    firstRun = !loadError;
    state = emptyState();
    return state;
  }
  try {
    state = migrate(JSON.parse(raw));
  } catch (err) {
    console.error('Could not read saved data', err);
    loadError = err;
    try {
      localStorage.setItem(CORRUPT_KEY, raw);
    } catch {
      /* ignore */
    }
    state = emptyState();
  }
  return state;
}

export const getState = () => state;
export const isFirstRun = () => firstRun;
export const getLoadError = () => loadError;

export function onSaveError(fn) {
  saveErrorHandler = fn;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save', err);
    saveErrorHandler?.(err);
  }
  for (const fn of [...listeners]) fn(state);
}

export function getTask(id) {
  return state.tasks.find((t) => t.id === id) ?? null;
}

function touch(task) {
  task.updatedAt = new Date().toISOString();
}

/** Adds a task built from form fields. Returns the stored task. */
export function createTask(fields) {
  const now = new Date().toISOString();
  const [task] = normalizeState({
    tasks: [{ ...fields, id: newId(), createdAt: now, updatedAt: now }],
  }).tasks;
  state.tasks.push(task);
  commit();
  return task;
}

/** Replaces a task's editable fields. Progress is left alone. */
export function updateTask(id, fields) {
  const index = state.tasks.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const old = state.tasks[index];
  const [task] = normalizeState({
    tasks: [{ ...old, ...fields, id, kind: old.kind, createdAt: old.createdAt, updatedAt: new Date().toISOString() }],
  }).tasks;
  state.tasks[index] = task;
  commit();
  return task;
}

/** Removes a task, all of its progress, and the habits it backs. */
export function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  delete state.progress[id];
  for (const character of state.characters) {
    if (character.habits.some((habit) => habit.taskId === id)) {
      character.habits = character.habits.filter((habit) => habit.taskId !== id);
    }
  }
  commit();
}

export function setTaskActive(id, active) {
  const task = getTask(id);
  if (!task || task.active === active) return;
  task.active = active;
  touch(task);
  commit();
}

function occurrence(taskId, date) {
  const byDate = (state.progress[taskId] ??= {});
  return (byDate[date] ??= { checklist: {}, completedAt: null, missedAt: null });
}

/** Drops an occurrence once it records nothing, so progress stays lean. */
function prune(taskId, date) {
  const byDate = state.progress[taskId];
  const occ = byDate?.[date];
  if (occ && !occ.completedAt && !occ.missedAt && !Object.keys(occ.checklist).length) delete byDate[date];
  if (byDate && !Object.keys(byDate).length) delete state.progress[taskId];
}

export function setChecklistItem(taskId, date, itemId, checked) {
  if (!getTask(taskId)) return;
  const occ = occurrence(taskId, date);
  if (checked) occ.checklist[itemId] = true;
  else delete occ.checklist[itemId];
  prune(taskId, date);
  commit();
}

export function completeOccurrence(taskId, date) {
  if (!getTask(taskId)) return;
  const occ = occurrence(taskId, date);
  occ.completedAt = new Date().toISOString();
  occ.missedAt = null;
  commit();
}

/** Records an occurrence as not done now, instead of waiting for its day to end. */
export function missOccurrence(taskId, date) {
  if (!getTask(taskId)) return;
  const occ = occurrence(taskId, date);
  occ.missedAt = new Date().toISOString();
  occ.completedAt = null;
  commit();
}

/** Clears Done or Not done from an occurrence. Checklist ticks stay. */
export function undoOccurrence(taskId, date) {
  const occ = state.progress[taskId]?.[date];
  if (!occ) return;
  occ.completedAt = null;
  occ.missedAt = null;
  prune(taskId, date);
  commit();
}

// ---------------------------------------------------------------------------
// Checklists: reusable lists, independent of tasks and dates.

export function getChecklist(id) {
  return state.checklists.find((c) => c.id === id) ?? null;
}

/** Adds a checklist built from form fields. Returns the stored checklist. */
export function createChecklist(fields) {
  const now = new Date().toISOString();
  const list = normalizeList({ ...fields, id: newId(), createdAt: now, updatedAt: now }, state.checklists.length);
  state.checklists.push(list);
  commit();
  return list;
}

/** Replaces a checklist's icon, name and items. */
export function updateChecklist(id, fields) {
  const index = state.checklists.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const old = state.checklists[index];
  const list = normalizeList({ ...old, ...fields, id, createdAt: old.createdAt, updatedAt: new Date().toISOString() }, index);
  state.checklists[index] = list;
  commit();
  return list;
}

export function deleteChecklist(id) {
  state.checklists = state.checklists.filter((c) => c.id !== id);
  commit();
}

/** Sets `checked` on the given items of a checklist (all of them to reset it). */
export function setListItemsChecked(listId, itemIds, checked) {
  const list = getChecklist(listId);
  if (!list) return;
  const ids = new Set(itemIds);
  let changed = false;
  for (const item of list.items) {
    if (!ids.has(item.id) || item.checked === checked) continue;
    item.checked = checked;
    changed = true;
  }
  if (changed) commit();
}

// ---------------------------------------------------------------------------
// Journal: at most one entry per local day.

export function getJournalEntry(date) {
  return state.journal[date] ?? null;
}

/**
 * Merges any of { text, emotions, energy } into a day's entry. An entry left
 * with nothing in it is removed. Returns the stored entry, or null.
 */
export function updateJournalEntry(date, fields) {
  if (!isValidKey(date)) return null;
  const old = state.journal[date];
  const now = new Date().toISOString();
  const entry = normalizeEntry({ ...old, ...fields, createdAt: old?.createdAt ?? now, updatedAt: now });
  if (entry) state.journal[date] = entry;
  else delete state.journal[date];
  commit();
  return entry;
}

export function deleteJournalEntry(date) {
  if (!Object.hasOwn(state.journal, date)) return;
  delete state.journal[date];
  commit();
}

// ---------------------------------------------------------------------------
// Habit characters: each one levels up from the tasks attached to it.

export function getCharacter(id) {
  return state.characters.find((c) => c.id === id) ?? null;
}

/** Characters with a habit backed by this task. */
export function charactersUsingTask(taskId) {
  return state.characters.filter((c) => c.habits.some((habit) => habit.taskId === taskId));
}

const taskIds = () => new Set(state.tasks.map((t) => t.id));

/** Adds a character built from form fields (avatar, name, leveling, mood). Returns the stored character. */
export function createCharacter(fields) {
  const now = new Date().toISOString();
  const character = normalizeCharacter(
    { ...fields, habits: [], id: newId(), createdAt: now, updatedAt: now }, state.characters.length, taskIds(),
  );
  state.characters.push(character);
  commit();
  return character;
}

/** Replaces a character's avatar, name, leveling and mood. Its habits are kept. */
export function updateCharacter(id, fields) {
  const index = state.characters.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const old = state.characters[index];
  const character = normalizeCharacter(
    { ...old, ...fields, id, habits: old.habits, createdAt: old.createdAt, updatedAt: new Date().toISOString() }, index, taskIds(),
  );
  state.characters[index] = character;
  commit();
  return character;
}

export function deleteCharacter(id) {
  state.characters = state.characters.filter((c) => c.id !== id);
  commit();
}

/**
 * Attaches a task to a character (habitId null) or replaces one of its
 * habits, from { taskId, since, done, missed }. Returns the stored habit, or
 * null when the character, habit or task is unknown, or when another habit
 * of this character already uses the task.
 */
export function saveHabit(characterId, habitId, fields) {
  const character = getCharacter(characterId);
  if (!character || !getTask(fields.taskId)) return null;
  if (habitId != null && !character.habits.some((habit) => habit.id === habitId)) return null;
  if (character.habits.some((habit) => habit.taskId === fields.taskId && habit.id !== habitId)) return null;
  const [habit] = normalizeCharacter({ ...character, habits: [{ ...fields, id: habitId ?? newId() }] }, 0, taskIds()).habits;
  if (!habit) return null;
  character.habits = habitId == null
    ? [...character.habits, habit]
    : character.habits.map((old) => (old.id === habitId ? habit : old));
  character.updatedAt = new Date().toISOString();
  commit();
  return habit;
}

export function deleteHabit(characterId, habitId) {
  const character = getCharacter(characterId);
  if (!character?.habits.some((habit) => habit.id === habitId)) return;
  character.habits = character.habits.filter((habit) => habit.id !== habitId);
  character.updatedAt = new Date().toISOString();
  commit();
}

/** Replaces everything with already-migrated state (import). */
export function replaceState(next) {
  state = next;
  commit();
}

/** Wipes all tasks, progress, checklists, journal entries, characters and the last-export marker. */
export function clearAll() {
  state = emptyState();
  try {
    localStorage.removeItem(LAST_EXPORT_KEY);
  } catch {
    /* ignore */
  }
  commit();
}

export function getLastExport() {
  try {
    return localStorage.getItem(LAST_EXPORT_KEY);
  } catch {
    return null;
  }
}

export function setLastExport(iso = new Date().toISOString()) {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, iso);
  } catch {
    /* ignore */
  }
}
