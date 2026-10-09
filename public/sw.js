/*
 * Service worker: precaches the whole app shell and serves it cache-first so
 * the app works with the PC server off.
 *
 * Bump CACHE_VERSION whenever any file in public/ changes, and list new files
 * in PRECACHE. Installed phones only pick up changes when this file changes.
 */

const CACHE_VERSION = 'v5';
const CACHE_PREFIX = 'taskmanager-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/dates.js',
  './js/icons.js',
  './js/io.js',
  './js/moods.js',
  './js/schedule.js',
  './js/store.js',
  './js/ui.js',
  './js/screens/checklist-form.js',
  './js/screens/checklist-view.js',
  './js/screens/checklists.js',
  './js/screens/home.js',
  './js/screens/journal-day.js',
  './js/screens/journal.js',
  './js/screens/settings.js',
  './js/screens/task-form.js',
  './js/screens/tasks.js',
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-512-maskable.png',
];

const INDEX_URL = new URL('./index.html', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Bypass the HTTP cache so a new version never precaches stale files.
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
  // No skipWaiting() here: the page shows "Update available" and asks first.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // App shell: always the cached index.html (routing is hash-based).
    event.respondWith(caches.match(INDEX_URL).then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'GET_VERSION') event.ports[0]?.postMessage({ version: CACHE_VERSION });
});
