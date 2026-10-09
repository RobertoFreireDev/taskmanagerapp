/*
 * Boot, hash router, bottom tab bar, service worker registration and updates.
 */

import * as store from './store.js';
import { todayKey, msUntilMidnight } from './dates.js';
import { h, icon, toast, closeAllOverlays, confirmDialog, trackVisualViewport } from './ui.js';
import * as homeScreen from './screens/home.js';
import * as tasksScreen from './screens/tasks.js';
import * as taskFormScreen from './screens/task-form.js';
import * as checklistsScreen from './screens/checklists.js';
import * as checklistViewScreen from './screens/checklist-view.js';
import * as checklistFormScreen from './screens/checklist-form.js';
import * as journalScreen from './screens/journal.js';
import * as journalDayScreen from './screens/journal-day.js';
import * as settingsScreen from './screens/settings.js';

const idParam = (m) => ({ id: decodeURIComponent(m[1]) });

const ROUTES = [
  { re: /^#\/home$/, screen: homeScreen, tab: 'home' },
  { re: /^#\/tasks$/, screen: tasksScreen, tab: 'tasks' },
  { re: /^#\/tasks\/new$/, screen: taskFormScreen, tab: 'tasks' },
  { re: /^#\/tasks\/([^/]+)$/, screen: taskFormScreen, tab: 'tasks', params: idParam },
  { re: /^#\/checklists$/, screen: checklistsScreen, tab: 'checklists' },
  { re: /^#\/checklists\/new$/, screen: checklistFormScreen, tab: 'checklists' },
  { re: /^#\/checklists\/([^/]+)\/edit$/, screen: checklistFormScreen, tab: 'checklists', params: idParam },
  { re: /^#\/checklists\/([^/]+)$/, screen: checklistViewScreen, tab: 'checklists', params: idParam },
  { re: /^#\/journal$/, screen: journalScreen, tab: 'journal' },
  { re: /^#\/journal\/(\d{4}-\d{2})$/, screen: journalScreen, tab: 'journal', params: (m) => ({ month: m[1] }) },
  { re: /^#\/journal\/(\d{4}-\d{2}-\d{2})$/, screen: journalDayScreen, tab: 'journal', params: (m) => ({ date: m[1] }) },
  { re: /^#\/settings$/, screen: settingsScreen, tab: 'settings' },
];
const DEFAULT_HASH = '#/home';

const TABS = [
  { key: 'home', label: 'Home', href: '#/home', icon: 'today' },
  { key: 'tasks', label: 'Tasks', href: '#/tasks', icon: 'list' },
  { key: 'checklists', label: 'Checklists', href: '#/checklists', icon: 'clipboard' },
  { key: 'journal', label: 'Journal', href: '#/journal', icon: 'journal' },
  { key: 'settings', label: 'Settings', href: '#/settings', icon: 'settings' },
];

const els = {};
let current = null; // { hash, instance }
let currentDay = todayKey();

// ---------------------------------------------------------------------------
// Service worker

const sw = {
  registration: null,
  reloadOnControllerChange: false,
  updateToastShown: false,
};

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      sw.registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          // An installed worker with an existing controller is an update, not the first install.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
        });
      });
    })
    .catch((err) => console.error('Service worker registration failed', err));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!sw.reloadOnControllerChange) return;
    sw.reloadOnControllerChange = false;
    location.reload();
  });
}

function promptUpdate(worker) {
  if (sw.updateToastShown) return;
  sw.updateToastShown = true;
  toast('Update available', {
    actionLabel: 'Reload',
    duration: 0,
    onAction: () => {
      sw.reloadOnControllerChange = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
  });
}

/** Resolves 'unsupported' | 'updating' | 'latest'. */
async function checkForUpdates() {
  const reg = sw.registration;
  if (!reg) return 'unsupported';
  await reg.update();
  if (reg.waiting) {
    sw.updateToastShown = false;
    promptUpdate(reg.waiting);
    return 'updating';
  }
  return reg.installing ? 'updating' : 'latest';
}

/** The CACHE_VERSION of the worker serving this page, or null. */
function getVersion() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data?.version ?? null);
    };
    controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

const ctx = {
  checkForUpdates,
  getVersion,
  get swSupported() {
    return 'serviceWorker' in navigator && window.isSecureContext;
  },
  navigate(hash, { replace = false } = {}) {
    if (replace) {
      history.replaceState(null, '', hash);
      route();
    } else {
      location.hash = hash;
    }
  },
};

// ---------------------------------------------------------------------------
// Router

function match(hash) {
  for (const r of ROUTES) {
    const m = r.re.exec(hash);
    if (m) return { ...r, params: r.params ? r.params(m) : {} };
  }
  return null;
}

let guardBusy = false;

async function onHashChange() {
  if (guardBusy) return;
  const next = location.hash;
  if (current?.instance?.isDirty?.() && next !== current.hash) {
    // Put the URL back while we ask; history.replaceState does not fire hashchange.
    guardBusy = true;
    history.replaceState(null, '', current.hash);
    const leave = await confirmDialog({
      title: 'Discard changes?',
      message: current.instance.dirtyMessage ?? 'You have unsaved changes to this task.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      danger: true,
    });
    guardBusy = false;
    if (!leave) return;
    current.instance.discard?.();
    history.pushState(null, '', next);
  }
  route();
}

function route() {
  const hash = location.hash;
  const found = match(hash);
  if (!found) {
    history.replaceState(null, '', DEFAULT_HASH);
    route();
    return;
  }
  closeAllOverlays();
  current?.instance?.unmount?.();
  els.header.replaceChildren();
  els.main.replaceChildren();
  els.main.scrollTop = 0;
  els.main.dataset.screen = found.tab;

  for (const a of els.tabbar.querySelectorAll('a')) {
    if (a.dataset.tab === found.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  const instance = found.screen.mount({ header: els.header, main: els.main, app: els.app, params: found.params, ctx }) ?? {};
  current = { hash, instance };
}

// ---------------------------------------------------------------------------
// Day rollover: refresh when the local date changes while the app is open.

function checkDay() {
  const today = todayKey();
  if (today === currentDay) return;
  currentDay = today;
  current?.instance?.refresh?.();
}

function scheduleMidnight() {
  setTimeout(() => {
    checkDay();
    scheduleMidnight();
  }, msUntilMidnight() + 1000);
}

// ---------------------------------------------------------------------------
// Boot

function buildTabbar() {
  els.tabbar.replaceChildren(
    ...TABS.map((t) =>
      h('a', { href: t.href, class: 'tab', dataset: { tab: t.key } }, icon(t.icon, 'tab-icon'), h('span', { class: 'tab-label' }, t.label)),
    ),
  );
}

async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted?.())) await navigator.storage.persist();
  } catch {
    /* not available */
  }
}

function boot() {
  els.app = document.getElementById('app');
  els.header = document.getElementById('app-header');
  els.main = document.getElementById('view');
  els.tabbar = document.getElementById('tabbar');

  store.init();
  store.onSaveError(() =>
    toast('Could not save. Device storage may be full — export a backup.', { variant: 'danger', duration: 6000 }),
  );
  if (store.getLoadError()) {
    toast('Saved data could not be read. A copy was kept; you are starting fresh.', { variant: 'danger', duration: 0 });
  }
  if (store.isFirstRun()) requestPersistence();

  trackVisualViewport();
  buildTabbar();
  registerServiceWorker();

  window.addEventListener('hashchange', onHashChange);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDay();
  });
  window.addEventListener('focus', checkDay);
  scheduleMidnight();

  if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', DEFAULT_HASH);
  route();
}

boot();
