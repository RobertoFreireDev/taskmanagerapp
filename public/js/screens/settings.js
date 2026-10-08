/*
 * Settings (#/settings): backup export/import, storage facts, updates, reset.
 */

import { getState, replaceState, clearAll, getLastExport, DataError } from '../store.js';
import { canShareBackup, shareBackup, downloadBackup, parseImport, MAX_IMPORT_BYTES } from '../io.js';
import { formatTimestamp } from '../dates.js';
import { h, icon, toast, confirmDialog } from '../ui.js';

const STALE_EXPORT_DAYS = 30;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function mount({ header, main, ctx }) {
  header.replaceChildren(h('div', { class: 'header-titles' }, h('h1', {}, 'Settings')));

  // --- Backup ----------------------------------------------------------------
  const lastExportLine = h('p', { class: 'setting-status' });

  function renderLastExport() {
    const last = getLastExport();
    const hasData = getState().tasks.length > 0;
    const ageDays = last ? (Date.now() - new Date(last).getTime()) / 86_400_000 : Infinity;
    lastExportLine.replaceChildren(last ? `Last export: ${formatTimestamp(last)}` : 'Never exported on this device.');
    lastExportLine.classList.toggle('is-warning', hasData && ageDays > STALE_EXPORT_DAYS);
  }

  async function onShare() {
    try {
      if (await shareBackup(getState())) toast('Backup shared');
    } catch (err) {
      console.error(err);
      toast('Could not share. Try Download backup instead.', { variant: 'danger' });
    }
    renderLastExport();
  }

  function onDownload() {
    try {
      downloadBackup(getState());
      toast('Backup downloaded');
    } catch (err) {
      console.error(err);
      toast('Could not create the backup file.', { variant: 'danger' });
    }
    renderLastExport();
  }

  const backupCard = card(
    'Backup',
    h('p', {}, 'Save everything (tasks, quick tasks and progress) to a JSON file. Keep it somewhere safe, like Drive, email or another device.'),
    lastExportLine,
    h('div', { class: 'button-stack' },
      canShareBackup() ? h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: onShare }, icon('share'), 'Share backup…') : null,
      h('button', { type: 'button', class: 'btn btn-block', onclick: onDownload }, icon('download'), 'Download backup')),
  );

  // --- Import ------------------------------------------------------------------
  const importError = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });

  function showImportError(message) {
    importError.textContent = message;
    importError.hidden = false;
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    importError.hidden = true;
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return showImportError('This file is too large to be a backup.');

    let result;
    try {
      result = parseImport(await file.text());
    } catch (err) {
      if (err instanceof DataError) return showImportError(err.message);
      console.error(err);
      return showImportError('This file could not be read.');
    }

    const { tasks, progressRecords, exportedAt } = result.summary;
    const ok = await confirmDialog({
      title: 'Replace all data?',
      message: [
        `${plural(tasks, 'task')}, ${plural(progressRecords, 'progress record')}, exported on ${exportedAt ? formatTimestamp(exportedAt) : 'an unknown date'}.`,
        'This will replace all current data.',
      ],
      confirmLabel: 'Replace',
      danger: true,
    });
    if (!ok) return;
    replaceState(result.state);
    toast('Backup imported');
    renderLastExport();
  });

  const importCard = card(
    'Restore',
    h('p', {}, 'Import a backup file. It replaces all data in this app; nothing is merged.'),
    importError,
    fileInput,
    h('button', { type: 'button', class: 'btn btn-block', onclick: () => fileInput.click() }, icon('upload'), 'Import backup…'),
  );

  // --- Storage -----------------------------------------------------------------
  const persistLine = h('p', { class: 'setting-status' }, 'Persistent storage: checking…');

  async function renderPersist() {
    if (!navigator.storage?.persisted) {
      persistLine.replaceChildren('Persistent storage: not available in this browser.');
      return;
    }
    const persisted = await navigator.storage.persisted().catch(() => false);
    if (persisted) {
      persistLine.replaceChildren('Persistent storage: granted. The browser will not clear this data on its own.');
      return;
    }
    persistLine.replaceChildren(
      'Persistent storage: not granted. The browser may clear data when the device is low on space. ',
      h('button', {
        type: 'button', class: 'link-btn',
        onclick: async () => {
          const granted = await navigator.storage.persist?.().catch(() => false);
          toast(granted ? 'Persistent storage granted' : 'The browser declined. Installing the app usually helps.');
          renderPersist();
        },
      }, 'Request'),
    );
  }

  const storageCard = card(
    'Storage',
    h('p', {}, 'Your data lives only on this device, inside this app. There is no account and no sync.'),
    h('p', { class: 'callout callout-warning' }, icon('alert'),
      h('span', {}, 'Removing the app from your home screen, or clearing the browser’s site data, deletes everything for good. Export a backup regularly.')),
    h('p', { class: 'muted' }, 'On iPhone, the home-screen app has its own storage, separate from Safari. Import backups inside the installed app.'),
    isStandalone() ? null : h('p', { class: 'muted' }, 'You are using the app in a browser tab. Data here is separate from the installed home-screen app.'),
    persistLine,
  );

  // --- App -------------------------------------------------------------------------
  const versionLine = h('p', { class: 'setting-status' }, 'Version: …');
  const updateBtn = h('button', { type: 'button', class: 'btn btn-block', disabled: !ctx.swSupported }, icon('refresh'), 'Check for updates');
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    try {
      const result = await ctx.checkForUpdates();
      if (result === 'latest') toast('You have the latest version');
      else if (result === 'updating') toast('Downloading update…');
      else toast('Updates need the service worker, which is not running.');
    } catch (err) {
      console.error(err);
      toast('Could not check for updates. Is the PC server running?', { variant: 'danger' });
    } finally {
      updateBtn.disabled = false;
    }
  });

  ctx.getVersion().then((v) => {
    versionLine.textContent = v ? `Version: ${v}` : 'Version: unknown (no service worker)';
  });

  const appCard = card(
    'App',
    versionLine,
    window.isSecureContext
      ? null
      : h('p', { class: 'callout callout-danger' }, icon('alert'),
          h('span', {}, 'Not a secure context, so offline mode is off and the app needs the PC server. Open it via http://localhost (Android, adb reverse) or HTTPS. See the README.')),
    h('p', { class: 'muted' }, 'Updates download from the PC server. Start it, then check.'),
    updateBtn,
  );

  // --- Danger zone ---------------------------------------------------------------
  async function onDeleteAll() {
    const first = await confirmDialog({
      title: 'Delete all data?',
      message: 'All tasks, quick tasks and progress in this app will be deleted.',
      confirmLabel: 'Continue',
      danger: true,
    });
    if (!first) return;
    const count = getState().tasks.length;
    const second = await confirmDialog({
      title: 'Are you sure?',
      message: [`This permanently deletes ${plural(count, 'task')} and cannot be undone.`, 'Export a backup first if you might need it.'],
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!second) return;
    clearAll();
    toast('All data deleted');
    renderLastExport();
  }

  const dangerCard = card(
    'Danger zone',
    h('button', { type: 'button', class: 'btn btn-danger btn-block', onclick: onDeleteAll }, icon('trash'), 'Delete all data'),
  );
  dangerCard.classList.add('card-danger');

  main.replaceChildren(h('div', { class: 'settings' }, backupCard, importCard, storageCard, appCard, dangerCard));
  renderLastExport();
  renderPersist();

  return {};
}

function card(title, ...children) {
  return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, title), ...children);
}
