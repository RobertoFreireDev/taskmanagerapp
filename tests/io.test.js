import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildExport, parseImport, exportFilename, APP_ID } from '../public/js/io.js';
import { migrate, DataError, SCHEMA_VERSION } from '../public/js/store.js';

const ts = '2026-10-08T11:00:00.000Z';

function sampleState() {
  return migrate({
    schemaVersion: 1,
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
  });
}

describe('export → import', () => {
  test('round-trips the exact same state, quick tasks included', () => {
    const state = sampleState();
    const file = JSON.stringify(buildExport(state, new Date(ts)), null, 2);
    const { state: restored, summary } = parseImport(file);
    assert.deepEqual(restored, state);
    assert.deepEqual(summary, { tasks: 4, progressRecords: 3, exportedAt: ts });
    assert.ok(restored.tasks.some((t) => t.kind === 'quick'));
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

  test('a file without progress imports with empty progress', () => {
    const doc = base();
    delete doc.progress;
    assert.deepEqual(parseImport(JSON.stringify(doc)).state.progress, {});
  });
});
