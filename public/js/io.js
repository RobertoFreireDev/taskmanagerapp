/*
 * Backup export / import / share.
 */

import { todayKey } from './dates.js';
import { SCHEMA_VERSION, DataError, migrate, setLastExport } from './store.js';

export const APP_ID = 'task-manager-pwa';
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** The export document. Always includes quick tasks, checklists, the journal and characters. */
export function buildExport(state, now = new Date()) {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    tasks: state.tasks,
    progress: state.progress,
    checklists: state.checklists,
    journal: state.journal,
    characters: state.characters,
  };
}

export function exportFilename(today = todayKey()) {
  return `tasks-backup-${today}.json`;
}

function backupFile(state) {
  const json = JSON.stringify(buildExport(state), null, 2);
  return new File([json], exportFilename(), { type: 'application/json' });
}

/** True when the system share sheet can take a JSON file. */
export function canShareBackup() {
  try {
    const probe = new File(['{}'], exportFilename(), { type: 'application/json' });
    return Boolean(navigator.canShare?.({ files: [probe] }));
  } catch {
    return false;
  }
}

/**
 * Opens the system share sheet with the backup so the user picks the target
 * app. Resolves true when shared, false when the user cancelled.
 */
export async function shareBackup(state) {
  const file = backupFile(state);
  if (!navigator.canShare?.({ files: [file] })) throw new Error('Sharing files is not supported on this device.');
  try {
    await navigator.share({ files: [file], title: 'Task Manager backup' });
  } catch (err) {
    if (err?.name === 'AbortError') return false;
    throw err;
  }
  setLastExport();
  return true;
}

/** Saves the backup through a Blob URL download. */
export function downloadBackup(state) {
  const file = backupFile(state);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  setLastExport();
}

/**
 * Parses and validates a backup's text. Returns { state, summary } or throws
 * DataError with a message fit to show the user. Never touches live state.
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DataError('This file is not valid JSON.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || data.app !== APP_ID) {
    throw new DataError('This is not a Task Manager backup file.');
  }
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    throw new DataError('The backup has no valid schema version.');
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new DataError('This backup was made by a newer version of the app. Update the app, then import again.');
  }
  const state = migrate({
    schemaVersion: data.schemaVersion,
    tasks: data.tasks,
    progress: data.progress ?? {},
    checklists: data.checklists ?? [],
    journal: data.journal ?? {},
    characters: data.characters ?? [],
  });
  const progressRecords = Object.values(state.progress).reduce((n, byDate) => n + Object.keys(byDate).length, 0);
  return {
    state,
    summary: {
      tasks: state.tasks.length,
      checklists: state.checklists.length,
      progressRecords,
      journalEntries: Object.keys(state.journal).length,
      characters: state.characters.length,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    },
  };
}
