import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../public/js/store.js';
import { EMOTIONS, ENERGY_LEVELS, MAX_EMOTIONS, renderEnergy, energyTone } from '../public/js/moods.js';

const ts = '2026-10-08T11:00:00.000Z';

/** In-memory localStorage, so the store saves and loads like it does on the phone. */
function installStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  return data;
}

const saved = (data) => JSON.parse(data.get(store.STORAGE_KEY));

const v1State = {
  schemaVersion: 1,
  tasks: [
    {
      id: 'walk', kind: 'regular', icon: 'pets', name: 'Walk the dog', active: true, notes: [], checklist: [{ id: 'c1', text: 'Leash' }],
      recurrence: { type: 'daily', interval: 1, weekdays: [], monthDays: [], yearDays: [], startDate: '2026-10-01' },
      createdAt: ts, updatedAt: ts,
    },
  ],
  progress: { walk: { '2026-10-08': { checklist: { c1: true }, completedAt: null } } },
};

describe('saved data from before checklists', () => {
  test('loads, keeps tasks and progress, and gains an empty checklist list and journal', () => {
    installStorage({ [store.STORAGE_KEY]: JSON.stringify(v1State) });
    const state = store.init();
    assert.equal(store.getLoadError(), null);
    assert.equal(state.schemaVersion, store.SCHEMA_VERSION);
    assert.deepEqual(state.checklists, []);
    assert.deepEqual(state.journal, {});
    assert.equal(state.tasks[0].name, 'Walk the dog');
    assert.deepEqual(state.progress, v1State.progress);
  });
});

describe('saved data from before the journal', () => {
  test('a schema 2 state loads with its checklists and an empty journal', () => {
    const list = { id: 'trip', icon: 'travel', name: 'Trip', items: [{ id: 'a', text: 'Passport', checked: true }], createdAt: ts, updatedAt: ts };
    installStorage({ [store.STORAGE_KEY]: JSON.stringify({ ...v1State, schemaVersion: 2, checklists: [list] }) });
    const state = store.init();
    assert.equal(store.getLoadError(), null);
    assert.equal(state.schemaVersion, 3);
    assert.deepEqual(state.checklists, [list]);
    assert.deepEqual(state.journal, {});
  });
});

describe('moods', () => {
  test('32 emotions with unique emoji, 8 energy levels from 0 to 100', () => {
    const keys = Object.keys(EMOTIONS);
    assert.equal(keys.length, 32);
    assert.equal(new Set(keys.map((k) => EMOTIONS[k].emoji)).size, 32);
    assert.ok(keys.every((k) => EMOTIONS[k].label));
    assert.equal(MAX_EMOTIONS, 3);
    assert.equal(ENERGY_LEVELS.length, 8);
    assert.equal(ENERGY_LEVELS[0], 0);
    assert.equal(ENERGY_LEVELS.at(-1), 100);
    assert.ok(ENERGY_LEVELS.every((n, i) => i === 0 || n > ENERGY_LEVELS[i - 1]));
  });

  test('energy batteries fill one bar per step', () => {
    assert.ok(!renderEnergy(0).includes('fill="currentColor"'));
    assert.match(renderEnergy(100), /width="12"/);
    assert.equal(energyTone(0), 'danger');
    assert.equal(energyTone(43), 'warning');
    assert.equal(energyTone(57), 'accent');
    assert.equal(energyTone(100), 'success');
  });
});

describe('journal', () => {
  let data;
  beforeEach(() => {
    data = installStorage({ [store.STORAGE_KEY]: JSON.stringify(v1State) });
    store.init();
  });

  const DAY = '2026-10-08';

  test('creates, merges and saves an entry', () => {
    const first = store.updateJournalEntry(DAY, { text: '  Long day.  ' });
    assert.equal(first.text, 'Long day.');
    assert.deepEqual(first.emotions, []);
    assert.equal(first.energy, null);
    assert.ok(first.createdAt);

    const second = store.updateJournalEntry(DAY, { emotions: ['tired', 'happy'], energy: 43 });
    assert.equal(second.text, 'Long day.');
    assert.deepEqual(second.emotions, ['tired', 'happy']);
    assert.equal(second.energy, 43);
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(store.getJournalEntry(DAY), second);
    assert.deepEqual(saved(data).journal, { [DAY]: second });
    assert.equal(saved(data).tasks.length, 1);
  });

  test('keeps at most 3 known, unique emotions and only valid energy levels', () => {
    const entry = store.updateJournalEntry(DAY, { emotions: ['sad', 'sad', 'unicorn', 'calm', 'angry', 'happy'], energy: 50 });
    assert.deepEqual(entry.emotions, ['sad', 'calm', 'angry']);
    assert.equal(entry.energy, null);
    assert.equal(store.updateJournalEntry(DAY, { energy: 100 }).energy, 100);
  });

  test('an entry emptied of everything is removed', () => {
    store.updateJournalEntry(DAY, { text: 'Hi', energy: 0 });
    assert.equal(store.updateJournalEntry(DAY, { text: '   ' }).energy, 0); // energy 0 still counts
    assert.equal(store.updateJournalEntry(DAY, { energy: null }), null);
    assert.equal(store.getJournalEntry(DAY), null);
    assert.deepEqual(saved(data).journal, {});
  });

  test('ignores invalid dates; delete and delete-all remove entries', () => {
    assert.equal(store.updateJournalEntry('2026-02-30', { text: 'x' }), null);
    assert.deepEqual(store.getState().journal, {});
    store.updateJournalEntry(DAY, { text: 'One' });
    store.updateJournalEntry('2026-10-07', { text: 'Two' });
    store.deleteJournalEntry(DAY);
    assert.deepEqual(Object.keys(saved(data).journal), ['2026-10-07']);
    store.clearAll();
    assert.deepEqual(store.getState().journal, {});
    assert.deepEqual(saved(data), store.emptyState());
  });
});

describe('checklists', () => {
  let data;
  beforeEach(() => {
    data = installStorage({ [store.STORAGE_KEY]: JSON.stringify(v1State) });
    store.init();
  });

  const create = () =>
    store.createChecklist({
      icon: 'travel',
      name: '  Trip to Lisbon  ',
      items: [{ id: 'a', text: 'Sunscreen' }, { id: 'b', text: '  ' }, { id: 'c', text: 'Passport', checked: true }],
    });

  test('create trims, drops empty items, saves, and leaves tasks alone', () => {
    const list = create();
    assert.equal(list.name, 'Trip to Lisbon');
    assert.deepEqual(list.items, [{ id: 'a', text: 'Sunscreen', checked: false }, { id: 'c', text: 'Passport', checked: true }]);
    assert.ok(list.id);
    assert.equal(store.getChecklist(list.id), list);
    assert.deepEqual(saved(data).checklists, [list]);
    assert.equal(saved(data).tasks.length, 1);
  });

  test('ticking items and unchecking all', () => {
    const list = create();
    store.setListItemsChecked(list.id, ['a'], true);
    assert.deepEqual(store.getChecklist(list.id).items.map((i) => i.checked), [true, true]);
    store.setListItemsChecked(list.id, ['a', 'c'], false);
    assert.deepEqual(saved(data).checklists[0].items.map((i) => i.checked), [false, false]);
    // Unknown lists and items are ignored.
    store.setListItemsChecked('nope', ['a'], true);
    store.setListItemsChecked(list.id, ['zzz'], true);
    assert.deepEqual(store.getChecklist(list.id).items.map((i) => i.checked), [false, false]);
  });

  test('update keeps id, createdAt and checked state of kept items', () => {
    const list = create();
    const updated = store.updateChecklist(list.id, {
      icon: 'nature',
      name: 'Beach trip',
      items: [{ id: 'c', text: 'Passport', checked: true }, { id: 'd', text: 'Towel' }],
    });
    assert.equal(updated.id, list.id);
    assert.equal(updated.createdAt, list.createdAt);
    assert.equal(updated.icon, 'nature');
    assert.equal(updated.name, 'Beach trip');
    assert.deepEqual(updated.items, [{ id: 'c', text: 'Passport', checked: true }, { id: 'd', text: 'Towel', checked: false }]);
    assert.equal(store.updateChecklist('nope', { name: 'X' }), null);
  });

  test('delete removes only that checklist', () => {
    const a = create();
    const b = store.createChecklist({ name: 'Groceries', items: ['Milk'] });
    assert.equal(b.icon, 'task');
    store.deleteChecklist(a.id);
    assert.equal(store.getChecklist(a.id), null);
    assert.deepEqual(saved(data).checklists.map((c) => c.name), ['Groceries']);
    assert.equal(saved(data).tasks.length, 1);
  });

  test('deleting a task leaves checklists alone', () => {
    const list = create();
    store.deleteTask('walk');
    assert.deepEqual(saved(data).checklists, [list]);
  });

  test('delete all data clears checklists too', () => {
    create();
    store.clearAll();
    assert.deepEqual(store.getState().checklists, []);
    assert.deepEqual(saved(data), store.emptyState());
  });
});
