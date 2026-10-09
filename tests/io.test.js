import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildExport, parseImport, exportFilename, APP_ID } from '../public/js/io.js';
import { migrate, DataError, SCHEMA_VERSION } from '../public/js/store.js';

const ts = '2026-10-08T11:00:00.000Z';

function sampleState() {
  return migrate({
    schemaVersion: SCHEMA_VERSION,
    tasks: [
      {
        id: 'walk', kind: 'regular', icon: 'pets', name: 'Walk the dog', active: true,
        notes: ['Take the blue leash', 'Bring bags'],
        checklist: [{ id: 'c1', text: 'Water bowl' }, { id: 'c2', text: 'Treats' }],
        recurrence: { type: 'weekly', interval: 2, weekdays: [1, 4], monthDays: [], yearDays: [], startDate: '2026-09-07' },
        createdAt: ts, updatedAt: ts,
      },
      {
        id: 'rent', kind: 'regular', icon: 'pay', name: 'Pay rent', active: false, notes: [], checklist: [],
        recurrence: { type: 'monthly', interval: 1, weekdays: [], monthDays: [1, 31], yearDays: [], startDate: '2026-01-01' },
        createdAt: ts, updatedAt: ts,
      },
      {
        id: 'bday', kind: 'regular', icon: 'gift', name: 'Birthday', active: true, notes: [], checklist: [],
        recurrence: { type: 'yearly', interval: 1, weekdays: [], monthDays: [], yearDays: [{ month: 2, day: 29 }], startDate: '2026-01-01' },
        createdAt: ts, updatedAt: ts,
      },
      {
        id: 'q1', kind: 'quick', icon: 'task', name: 'Call plumber', active: true, notes: [], checklist: [{ id: 'x', text: 'Get quote' }],
        recurrence: { type: 'once', interval: 1, weekdays: [], monthDays: [], yearDays: [], startDate: '2026-10-08' },
        createdAt: ts, updatedAt: ts,
      },
    ],
    progress: {
      walk: { '2026-10-05': { checklist: { c1: true }, completedAt: ts }, '2026-10-08': { checklist: { c2: true, gone: true }, completedAt: null } },
      q1: { '2026-10-08': { checklist: { x: true }, completedAt: null } },
    },
    checklists: [
      {
        id: 'trip', icon: 'travel', name: 'Trip to Lisbon',
        items: [{ id: 'i1', text: 'Sunscreen', checked: true }, { id: 'i2', text: 'Passport', checked: false }],
        createdAt: ts, updatedAt: ts,
      },
      { id: 'empty', icon: 'task', name: 'Empty list', items: [], createdAt: ts, updatedAt: ts },
    ],
    journal: {
      '2026-10-08': { text: 'Long day.\nGood walk though.', emotions: ['tired', 'grateful'], energy: 43, createdAt: ts, updatedAt: ts },
      '2026-10-07': { text: '', emotions: [], energy: 0, createdAt: ts, updatedAt: ts },
      '2026-09-30': { text: 'Only words.', emotions: [], energy: null, createdAt: ts, updatedAt: ts },
    },
    characters: [
      {
        id: 'rex', avatar: 'dog', name: 'Rex',
        leveling: { base: 100, step: 50 }, mood: { period: 'week', happyMax: 0, sadMin: 3 },
        habits: [
          { id: 'h1', taskId: 'walk', since: '2026-09-01', done: { xp: 10, status: 'strong' }, missed: { xp: 5, status: 'weak' } },
          { id: 'h2', taskId: 'rent', since: '2026-10-01', done: { xp: 50, status: 'rich' }, missed: { xp: 20, status: null } },
        ],
        createdAt: ts, updatedAt: ts,
      },
      {
        id: 'mia', avatar: 'cat', name: 'Mia',
        leveling: { base: 10, step: 0 }, mood: { period: 'day', happyMax: 1, sadMin: 2 },
        habits: [], createdAt: ts, updatedAt: ts,
      },
    ],
  });
}

describe('export → import', () => {
  test('round-trips the exact same state, quick tasks, checklists, journal and characters included', () => {
    const state = sampleState();
    const file = JSON.stringify(buildExport(state, new Date(ts)), null, 2);
    const { state: restored, summary } = parseImport(file);
    assert.deepEqual(restored, state);
    assert.deepEqual(summary, { tasks: 4, checklists: 2, progressRecords: 3, journalEntries: 3, characters: 2, exportedAt: ts });
    assert.ok(restored.tasks.some((t) => t.kind === 'quick'));
    assert.equal(restored.checklists[0].items[0].checked, true);
    assert.deepEqual(restored.journal['2026-10-08'].emotions, ['tired', 'grateful']);
    assert.equal(restored.journal['2026-10-07'].energy, 0);
    assert.deepEqual(restored.characters[0].habits.map((h) => h.taskId), ['walk', 'rent']);
  });

  test('export document shape', () => {
    const doc = buildExport(sampleState(), new Date(ts));
    assert.equal(doc.app, APP_ID);
    assert.equal(doc.schemaVersion, SCHEMA_VERSION);
    assert.equal(doc.exportedAt, ts);
    assert.equal(exportFilename('2026-10-08'), 'tasks-backup-2026-10-08.json');
  });

  test('migrate is idempotent', () => {
    const state = sampleState();
    assert.deepEqual(migrate(JSON.parse(JSON.stringify(state))), state);
  });

  test('a schema 1 backup (before checklists) still imports, with no checklists', () => {
    const doc = JSON.parse(JSON.stringify(buildExport(sampleState(), new Date(ts))));
    doc.schemaVersion = 1;
    delete doc.checklists;
    const { state, summary } = parseImport(JSON.stringify(doc));
    assert.equal(state.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(state.checklists, []);
    assert.equal(summary.checklists, 0);
    assert.deepEqual(state.journal, {});
    assert.deepEqual(state.tasks, sampleState().tasks);
  });

  test('a schema 2 backup (before the journal) still imports, with an empty journal', () => {
    const doc = JSON.parse(JSON.stringify(buildExport(sampleState(), new Date(ts))));
    doc.schemaVersion = 2;
    delete doc.journal;
    const { state, summary } = parseImport(JSON.stringify(doc));
    assert.equal(state.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(state.journal, {});
    assert.equal(summary.journalEntries, 0);
    assert.deepEqual(state.checklists, sampleState().checklists);
  });

  test('a schema 3 backup (before characters) still imports, with no characters', () => {
    const doc = JSON.parse(JSON.stringify(buildExport(sampleState(), new Date(ts))));
    doc.schemaVersion = 3;
    delete doc.characters;
    const { state, summary } = parseImport(JSON.stringify(doc));
    assert.equal(state.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(state.characters, []);
    assert.equal(summary.characters, 0);
    assert.deepEqual(state.journal, sampleState().journal);
  });
});

describe('import validation', () => {
  const base = () => JSON.parse(JSON.stringify(buildExport(sampleState(), new Date(ts))));
  const rejects = (doc, pattern) => assert.throws(() => parseImport(typeof doc === 'string' ? doc : JSON.stringify(doc)), (err) => {
    assert.ok(err instanceof DataError, `expected DataError, got ${err}`);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });

  test('rejects non-JSON and foreign files', () => {
    rejects('not json {', /not valid JSON/);
    rejects([], /not a Task Manager backup/);
    rejects({ ...base(), app: 'something-else' }, /not a Task Manager backup/);
  });

  test('rejects newer or missing schema versions', () => {
    rejects({ ...base(), schemaVersion: SCHEMA_VERSION + 1 }, /newer version/);
    rejects({ ...base(), schemaVersion: undefined }, /schema version/);
  });

  test('rejects bad tasks', () => {
    rejects({ ...base(), tasks: {} }, /must be a list/);
    const noId = base();
    delete noId.tasks[0].id;
    rejects(noId, /no id/);
    const noName = base();
    noName.tasks[0].name = '   ';
    rejects(noName, /no name/);
    const badType = base();
    badType.tasks[0].recurrence.type = 'hourly';
    rejects(badType, /recurrence type/);
    const badDate = base();
    badDate.tasks[0].recurrence.startDate = '2026-9-7';
    rejects(badDate, /start date/);
    const dup = base();
    dup.tasks[1].id = dup.tasks[0].id;
    rejects(dup, /share the id/);
  });

  test('rejects bad progress dates', () => {
    const doc = base();
    doc.progress.walk['10/05/2026'] = { checklist: {}, completedAt: ts };
    rejects(doc, /invalid date/);
  });

  test('maps unknown icons to task and drops progress for unknown tasks', () => {
    const doc = base();
    doc.tasks[0].icon = 'unicorn';
    doc.tasks[1].icon = 'constructor';
    doc.progress.ghost = { '2026-10-01': { checklist: {}, completedAt: ts } };
    const { state } = parseImport(JSON.stringify(doc));
    assert.equal(state.tasks[0].icon, 'task');
    assert.equal(state.tasks[1].icon, 'task');
    assert.equal(state.progress.ghost, undefined);
  });

  test('rejects bad checklists', () => {
    rejects({ ...base(), checklists: {} }, /"checklists" must be a list/);
    const noId = base();
    delete noId.checklists[0].id;
    rejects(noId, /Checklist 1 has no id/);
    const noName = base();
    noName.checklists[1].name = '';
    rejects(noName, /Checklist 2 has no name/);
    const dup = base();
    dup.checklists[1].id = dup.checklists[0].id;
    rejects(dup, /Two checklists share the id/);
  });

  test('normalizes checklist icons and items', () => {
    const doc = base();
    doc.checklists[0].icon = 'unicorn';
    doc.checklists[0].items = ['  Socks  ', '', { text: 'Charger', checked: 'yes' }, { id: 'i9', text: 'Keys', checked: true }, 42];
    const [list] = parseImport(JSON.stringify(doc)).state.checklists;
    assert.equal(list.icon, 'task');
    assert.deepEqual(list.items.map(({ text, checked }) => ({ text, checked })), [
      { text: 'Socks', checked: false },
      { text: 'Charger', checked: false },
      { text: 'Keys', checked: true },
    ]);
    assert.equal(list.items[2].id, 'i9');
    assert.ok(list.items.every((item) => typeof item.id === 'string' && item.id));
  });

  test('a file without checklists imports with no checklists', () => {
    const doc = base();
    delete doc.checklists;
    assert.deepEqual(parseImport(JSON.stringify(doc)).state.checklists, []);
  });

  test('a file without progress imports with empty progress', () => {
    const doc = base();
    delete doc.progress;
    assert.deepEqual(parseImport(JSON.stringify(doc)).state.progress, {});
  });

  test('rejects a bad journal', () => {
    rejects({ ...base(), journal: [] }, /"journal" must be an object/);
    rejects({ ...base(), journal: 'dear diary' }, /"journal" must be an object/);
    const badDate = base();
    badDate.journal['10/08/2026'] = { text: 'Hi' };
    rejects(badDate, /Journal has an invalid date/);
    const impossible = base();
    impossible.journal['2026-02-30'] = { text: 'Hi' };
    rejects(impossible, /Journal has an invalid date/);
  });

  test('normalizes journal entries', () => {
    const doc = base();
    doc.journal['2026-10-08'].emotions = ['unicorn', 'tired', 'tired', 'happy', 'sad', 'calm'];
    doc.journal['2026-10-08'].energy = 50;
    doc.journal['2026-10-08'].text = '  Trimmed  ';
    doc.journal['2026-10-06'] = { text: '   ', emotions: ['nope'], energy: '43' }; // records nothing: dropped
    doc.journal['2026-10-05'] = 'not an entry';
    const { journal } = parseImport(JSON.stringify(doc)).state;
    assert.deepEqual(journal['2026-10-08'].emotions, ['tired', 'happy', 'sad']);
    assert.equal(journal['2026-10-08'].energy, null);
    assert.equal(journal['2026-10-08'].text, 'Trimmed');
    assert.equal(journal['2026-10-06'], undefined);
    assert.equal(journal['2026-10-05'], undefined);
  });

  test('keeps Not done marks; a completion wins over one; bad marks are dropped', () => {
    const doc = base();
    doc.progress.walk['2026-10-01'] = { checklist: {}, completedAt: null, missedAt: ts };
    doc.progress.walk['2026-10-02'] = { checklist: {}, completedAt: ts, missedAt: ts };
    doc.progress.walk['2026-10-03'] = { checklist: {}, missedAt: 'yesterday' }; // records nothing: dropped
    const { walk } = parseImport(JSON.stringify(doc)).state.progress;
    assert.deepEqual(walk['2026-10-01'], { checklist: {}, completedAt: null, missedAt: ts });
    assert.deepEqual(walk['2026-10-02'], { checklist: {}, completedAt: ts, missedAt: null });
    assert.equal(walk['2026-10-03'], undefined);
    assert.equal(walk['2026-10-05'].missedAt, null); // older files have no missedAt
  });

  test('rejects bad characters', () => {
    rejects({ ...base(), characters: {} }, /"characters" must be a list/);
    const noId = base();
    delete noId.characters[0].id;
    rejects(noId, /Character 1 has no id/);
    const noName = base();
    noName.characters[1].name = '  ';
    rejects(noName, /Character 2 has no name/);
    const dup = base();
    dup.characters[1].id = dup.characters[0].id;
    rejects(dup, /Two characters share the id/);
    const badSince = base();
    badSince.characters[0].habits[0].since = '2026-9-1';
    rejects(badSince, /habit with an invalid date/);
  });

  test('normalizes characters and their habits', () => {
    const doc = base();
    const [rex, mia] = doc.characters;
    rex.avatar = 'dragon';
    rex.leveling = { base: 0, step: -5 };
    rex.mood = { period: 'decade', happyMax: 4, sadMin: 2 };
    rex.habits[0].done.status = 'unicorn';
    rex.habits[0].missed.xp = 1e9;
    rex.habits.push(
      { id: 'h3', taskId: 'ghost', since: '2026-10-01', done: { xp: 1 }, missed: { xp: 1 } }, // unknown task: dropped
      { id: 'h4', taskId: 'walk', since: '2026-10-01', done: { xp: 1 }, missed: { xp: 1 } }, // task already attached: dropped
      'not a habit',
    );
    mia.leveling = 'steep';
    mia.mood = null;
    delete mia.habits;
    const { characters } = parseImport(JSON.stringify(doc)).state;
    assert.equal(characters[0].avatar, 'kid');
    assert.deepEqual(characters[0].leveling, { base: 1, step: 0 });
    assert.deepEqual(characters[0].mood, { period: 'week', happyMax: 4, sadMin: 5 });
    assert.deepEqual(characters[0].habits.map((h) => h.id), ['h1', 'h2']);
    assert.deepEqual(characters[0].habits[0].done, { xp: 10, status: null });
    assert.deepEqual(characters[0].habits[0].missed, { xp: 9999, status: 'weak' });
    assert.deepEqual(characters[1].leveling, { base: 100, step: 50 });
    assert.deepEqual(characters[1].mood, { period: 'week', happyMax: 0, sadMin: 3 });
    assert.deepEqual(characters[1].habits, []);
  });
});
