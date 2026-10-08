import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../public/js/store.js';

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
  test('loads, keeps tasks and progress, and gains an empty checklist list', () => {
    installStorage({ [store.STORAGE_KEY]: JSON.stringify(v1State) });
    const state = store.init();
    assert.equal(store.getLoadError(), null);
    assert.equal(state.schemaVersion, store.SCHEMA_VERSION);
    assert.deepEqual(state.checklists, []);
    assert.equal(state.tasks[0].name, 'Walk the dog');
    assert.deepEqual(state.progress, v1State.progress);
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
