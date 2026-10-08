# CLAUDE.md — Task Manager PWA

A mobile-only, dark-mode, offline-first task manager. It is installed to the phone's home screen (Android and iPhone) from a local server on the developer's PC. It does not go through an app store. There is no login, no backend and no sync. All data stays on the phone. Users move data between devices by exporting and importing JSON.

Read this whole file before writing code. The **Hard rules** section is non-negotiable.

---

## 1. Hard rules

1. **No frameworks, no build step, no runtime dependencies.** Use plain HTML, CSS and JavaScript ES modules, served as static files. The only tooling allowed is Node's built-in modules (for `server.js` and tests).
2. **No network requests at runtime.** Load no CDN, Google Font, analytics or remote icons. Every asset ships in `public/` and is precached by the service worker.
3. **Dark mode only.** Set `color-scheme: dark`. Add no light theme and no `prefers-color-scheme` branches.
4. **Mobile only.** Design for widths of 360–430 px. On wider screens, center the app in a 480 px column. Do not build a desktop layout.
5. **No auth.** Add no accounts, login screens or tokens.
6. **Must work fully offline** once installed, with the PC server turned off.
7. **Dates are local calendar dates.** Store them as `"YYYY-MM-DD"` strings. Never use `toISOString()` to build a date key, because it converts to UTC and shifts the day. Use the helpers in `js/dates.js` only.
8. **Keep the scheduling logic pure.** `js/schedule.js` must not touch the DOM or storage, and it must have unit tests.
9. When you change any file in `public/`, **bump `CACHE_VERSION` in `sw.js`**. Otherwise installed phones keep the old version.

---

## 2. Installing on the phone (HTTPS reality check)

Service workers, and therefore offline support and true PWA install, require a **secure context**. That means either HTTPS or the literal origin `http://localhost`. If the phone opens `http://192.168.x.x:8080`, the page is **not** a secure context. In that case:

- the service worker will not register, so the app has **no offline support**;
- `crypto.randomUUID()` and `navigator.share({ files })` are unavailable;
- the iPhone can still "Add to Home Screen", but the app breaks as soon as the PC server stops.

So the answer to "without a certificate?" is **yes on Android, no on iPhone**. Support these paths and document them in `README.md`:

### Android, no certificate (recommended)
- Connect the phone by USB with USB debugging on, then run `adb reverse tcp:8080 tcp:8080`.
- On the phone, open **`http://localhost:8080`** in Chrome. This counts as a secure context.
- Use Chrome menu → **Install app** / **Add to Home screen**. The USB cable is not needed afterwards.
- Alternative without USB: `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → add `http://<PC-LAN-IP>:8080` → relaunch Chrome.

### iPhone (needs HTTPS — choose one)
- **mkcert (fully local, recommended):**
  1. Run `mkcert -install`, then `mkcert -cert-file certs/cert.pem -key-file certs/key.pem <PC-LAN-IP> localhost`.
  2. Send `rootCA.pem` (from `mkcert -CAROOT`) to the iPhone by AirDrop or email.
  3. Install it under Settings → General → VPN & Device Management.
  4. Enable full trust under Settings → General → About → Certificate Trust Settings.
  5. Open `https://<PC-LAN-IP>:8443` in **Safari** → Share → **Add to Home Screen**.
- **HTTPS tunnel (needs internet only during install):** `cloudflared tunnel --url http://localhost:8080` and open the `trycloudflare.com` URL in Safari. The URL changes on every run, and the origin determines where data is stored. Install once and keep that home-screen app. To move to a new origin, export the JSON and import it in the new app.

### Data storage facts to respect
- Data belongs to the **origin**: protocol, host and port together. Changing the port or IP creates a new, empty app.
- On iOS, the home-screen app has **separate storage from Safari**. Users must import data inside the installed app.
- Deleting the home-screen app deletes its data. The Settings screen must make this clear and encourage exports.
- Call `navigator.storage.persist()` on first run, where available.

### `server.js` (zero dependencies)
- Serves `public/` with correct MIME types (`.webmanifest` → `application/manifest+json`, `.js` → `text/javascript`).
- Sends `Cache-Control: no-cache` for `sw.js`, `index.html` and `manifest.webmanifest`.
- Serves HTTP on `8080` always. If `certs/cert.pem` and `certs/key.pem` exist, it also serves HTTPS on `8443`.
- Listens on `0.0.0.0` and prints every LAN URL on startup.
- `certs/` is gitignored.

---

## 3. Project structure

```
/
├── CLAUDE.md
├── README.md                 # install steps from section 2, for humans
├── server.js                 # zero-dep static server (HTTP + optional HTTPS)
├── package.json              # scripts only: "start", "test" — no dependencies
├── certs/                    # gitignored, mkcert output
├── tests/
│   ├── schedule.test.js      # node --test
│   ├── io.test.js            # export / import validation
│   └── store.test.js         # migration, checklist CRUD
└── public/
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js
    ├── css/app.css
    ├── img/                  # app icons: 180 (apple-touch), 192, 512, 512-maskable PNG
    └── js/
        ├── app.js            # boot, router, bottom tab bar, SW registration
        ├── dates.js          # local-date helpers (only place that builds date keys)
        ├── store.js          # load/save/migrate state in localStorage
        ├── schedule.js       # pure: isDue, home sections
        ├── icons.js          # 32 inline SVG icons + picker
        ├── io.js             # export / import / share
        ├── ui.js             # small DOM helpers, sheets, confirm dialog, toasts
        └── screens/
            ├── home.js
            ├── tasks.js
            ├── task-form.js
            ├── checklists.js       # checklist index
            ├── checklist-view.js   # tick items, uncheck all
            ├── checklist-form.js   # create / edit / delete a checklist
            └── settings.js
```

Routing uses hashes: `#/home` (default), `#/tasks`, `#/tasks/new`, `#/tasks/:id`, `#/checklists`, `#/checklists/new`, `#/checklists/:id`, `#/checklists/:id/edit`, `#/settings`. A fixed bottom tab bar holds four tabs: Home, Tasks, Checklists, Settings.

---

## 4. PWA requirements

### `manifest.webmanifest`
- `name`: "Task Manager"; `short_name`: "Tasks"
- `start_url`: `"./#/home"`; `scope`: `"./"`; `display`: `"standalone"`; `orientation`: `"portrait"`
- `background_color` and `theme_color` use the app background color (see section 9)
- `icons`: 192 and 512 PNG, plus a 512 PNG with `"purpose": "maskable"`

### `index.html` head
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="theme-color" content="#0f1115">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<meta name="apple-mobile-web-app-title" content="Tasks">`
- `<link rel="apple-touch-icon" href="img/icon-180.png">` — iOS ignores SVG and manifest icons here
- `<link rel="manifest" href="manifest.webmanifest">`

### `sw.js`
- `const CACHE_VERSION = 'v1'`. Precache every file in `public/` on install. Keep the list explicit.
- Strategy is **cache-first** for the app shell. Navigation requests fall back to the cached `index.html`.
- On `activate`, delete old caches. Do **not** call `skipWaiting()` automatically. When a new worker is waiting, the app shows an "Update available — Reload" toast, which posts `SKIP_WAITING`.
- Settings has a **Check for updates** button that calls `registration.update()`. iOS standalone apps have no pull-to-refresh.

---

## 5. Data model (`store.js`)

All state lives in one `localStorage` key, `taskmanager.state`, as JSON. Save after every mutation.

```js
State = {
  schemaVersion: 2,
  tasks: Task[],
  progress: { [taskId]: { [occurrenceDate: "YYYY-MM-DD"]: Occurrence } },
  checklists: Checklist[]
}

Task = {
  id: string,              // crypto.randomUUID() with fallback generator
  kind: "regular" | "quick",
  icon: IconKey,           // see section 8
  name: string,            // required, trimmed, max 80 chars
  active: boolean,         // false = never shown on Home
  notes: string[],         // free-text notes, shown on the card when expanded
  checklist: { id: string, text: string }[],
  recurrence: Recurrence,
  createdAt: string,       // ISO timestamp (metadata only, never used as a date key)
  updatedAt: string
}

Recurrence = {
  type: "once" | "daily" | "weekly" | "monthly" | "yearly",
  interval: number,        // every N days/weeks/months/years, integer >= 1 (ignored for once)
  weekdays: number[],      // weekly: 0=Sun … 6=Sat
  monthDays: number[],     // monthly: 1..31
  yearDays: { month: number, day: number }[], // yearly: month 1..12, day 1..31
  startDate: "YYYY-MM-DD"
}

Occurrence = {
  checklist: { [itemId]: boolean },  // progress is per occurrence; resets for each new occurrence
  completedAt: string | null         // ISO timestamp; null = not done
}

Checklist = {              // standalone and reusable; unrelated to tasks and dates
  id: string,
  icon: IconKey,
  name: string,            // required, trimmed, max 80 chars
  items: { id: string, text: string, checked: boolean }[],
  createdAt: string,
  updatedAt: string
}
```

- `load()` runs `migrate(raw)`. Every future schema change increments `schemaVersion` and adds a migration step. Never break old export files.
- If a checklist item is deleted from a task, ignore its orphaned keys in `progress`.
- When a task is deleted, delete its `progress` entry too.
- Schema history: 1 → 2 added `checklists` (migration sets it to `[]`).

---

## 6. Scheduling rules (`schedule.js` — pure, tested)

### `isDue(task, date)`
`isDue(task, date)` is false if `date < startDate`. Otherwise it depends on the type:

| Type | Due when |
|---|---|
| once | `date === startDate` |
| daily | `daysBetween(startDate, date) % interval === 0` |
| weekly | `date`'s weekday is in `weekdays` and `weeksBetween(weekOf(startDate), weekOf(date)) % interval === 0`. Weeks start on **Sunday** (`WEEK_STARTS_ON = 0` constant). If `weekdays` is empty, use the weekday of `startDate`. |
| monthly | `date`'s day is in `monthDays` and `monthsBetween(startDate, date) % interval === 0`. If a chosen day exceeds the month length (31 in April), it falls on the **last day of that month**. If `monthDays` is empty, use the day of `startDate`. |
| yearly | `{month, day}` of `date` matches an entry in `yearDays` and `(year − startYear) % interval === 0`. Feb 29 falls on Feb 28 in non-leap years. If `yearDays` is empty, use the month and day of `startDate`. |

### Home sections — `homeSections(state, today)`
These rules apply to tasks where `active === true`. A task appears **at most once** on Home.

1. **Done** — the task has an occurrence whose `completedAt` falls on `today` in local time. This includes a pending occurrence completed today.
2. **TO DO** — otherwise, if `isDue(task, today)`, the occurrence date is `today`.
3. **Pending** — otherwise, find the most recent due date before `today` that is not completed. Look back no further than the later of `startDate` and the last completed occurrence, and at most 366 days. If one exists, the task is pending for that occurrence date. The card shows "since <date>".
4. If the task is due today **and** has a missed earlier occurrence, show it in TO DO only. Missed occurrences of recurring tasks are skipped, not stacked.
5. Once tasks that were never done stay in Pending until completed or deleted.

Sort each section by name. Section counts appear in the section headers.

### Tests
Use `node --test tests/`. The tests must cover:
- each recurrence type with interval 1 and with interval greater than 1;
- empty weekday, month-day and year-day lists;
- day 31 in short months;
- Feb 29 in leap and non-leap years;
- tasks whose start date is in the future;
- the pending lookback, including a once task left overdue;
- a pending task completed today, which must land in Done;
- inactive tasks, which must never appear.

---

## 7. Screens

### Home (`#/home`)
- **Header:** the title "Today" plus the formatted local date. On the right, a **"+ Quick task"** button.
- **Sections:** TO DO, Pending and Done, in that order. Each section can be collapsed. An empty section shows a short muted line.
- **Task card:**
  - It shows the icon, the name, and a checklist progress count such as "2/5".
  - Tapping the card expands it to show the notes and the checklist. Checkbox state is saved in that occurrence's `progress` entry.
  - **Regular task:** a **Complete** button sets `completedAt`. In Done, the button becomes **Undo**, which clears `completedAt`.
  - **Quick task:** a **Delete** button replaces Complete. It asks for confirmation, then removes the task and its progress entirely. Quick tasks have no Complete button.
- **Quick task sheet:**
  - A bottom sheet with Name (required), a Notes list (add/remove rows) and a Checklist (add/remove rows).
  - On save, it creates `kind: "quick"`, `active: true`, `icon: "task"`, and `recurrence: { type: "once", interval: 1, startDate: today, … }`.
  - The new task appears in TO DO immediately.
  - If it is not deleted, it moves to Pending on following days (rule 5).

### Tasks (`#/tasks`)
- **List:** all `kind: "regular"` tasks with their icon and name. Each row has an active toggle and shows a one-line recurrence summary, for example "Every 2 weeks · Mon, Thu" or "Monthly · 1, 15". Quick tasks are not listed here; they live only on Home.
- A **floating "+" button** opens `#/tasks/new`.
- **Form (`#/tasks/new`, `#/tasks/:id`):**
  - Icon picker: a grid of 32 icons in a bottom sheet.
  - Name.
  - Active toggle.
  - Notes list, editable and reorderable with up/down buttons.
  - Checklist, editable and reorderable.
  - Recurrence type, as a segmented control: Once / Daily / Weekly / Monthly / Yearly.
  - "Every N" stepper, hidden for Once. Its label updates with the type: days, weeks, months or years.
  - Weekly: seven weekday chips, multi-select.
  - Monthly: a 1–31 day-grid, multi-select.
  - Yearly: a list of month+day pairs with add/remove.
  - Starts on: a native `<input type="date">`, defaulting to today.
  - A live preview showing the **next 5 occurrences**, using `schedule.js`.
- **Validation:** name is required; interval must be ≥ 1; start date is required.
- Edit mode has a Delete button with confirmation.
- Editing a recurrence does **not** erase past `progress`.

### Checklists (`#/checklists`)
Reusable lists for double-checking that nothing is missed, such as a packing list for a trip. They have **no dates, no scheduling and no Complete button**, and they never appear on Home.
- **List:** every checklist, sorted by name, with its icon and a progress line such as "3 of 7 checked". A **floating "+" button** opens `#/checklists/new`.
- **Checklist (`#/checklists/:id`):** a header with Back and **Edit**; a progress line and bar; the items as large checkbox rows. Ticks save immediately and persist until cleared. **Uncheck all** clears every tick so the list can be reused, with an Undo toast.
- **Form (`#/checklists/new`, `#/checklists/:id/edit`):** icon picker, Name (required) and an Items list that is editable and reorderable; Enter adds the next row. Editing keeps the ticks of items that remain. Edit mode has a Delete button with confirmation.

### Settings (`#/settings`)
- **Export:**
  - Build the export JSON (section 10). The filename is `tasks-backup-YYYY-MM-DD.json`.
  - If `navigator.canShare?.({ files: [file] })` is true, use `navigator.share({ files: [file], title })`. This opens the system share sheet, so the user **chooses the app** to send it to: WhatsApp, Drive, Files, Mail and so on.
  - Otherwise, fall back to a download through an `<a download>` Blob URL.
  - Provide two buttons: **Share backup…** (shown only when supported) and **Download backup**.
- **Import:**
  - Use `<input type="file" accept=".json,application/json">`. Parse the file and validate it (section 10).
  - Show a summary: "X tasks, Z checklists, Y progress records, exported on <date>".
  - Confirm with "This will replace all current data", then replace the state and re-render.
  - Invalid files show a clear error and change nothing.
- **Storage note:** state that data lives only on this device and that removing the app deletes it. Show the last export date, saved in localStorage under `taskmanager.lastExport`.
- **Check for updates** button, and the app version.
- **Delete all data:** a double-confirmation danger action.

---

## 8. Icons (`icons.js`)

There are 32 icons, stored as **inline SVG strings** with no icon fonts or CDN. Each uses `viewBox="0 0 24 24"`, `stroke="currentColor"` and `fill="none"`, so the icons inherit the text color. Draw them by hand, or vendor the paths from a permissively licensed set (Lucide, ISC license — keep the license notice in `public/js/icons.js`).

| Key | Label | Key | Label |
|---|---|---|---|
| pets | Pets | travel | Travel |
| home | Home | pay | Pay |
| work | Work | video | Video |
| gym | Gym | audio | Audio |
| nature | Nature | health | Health |
| kids | Kids | medicine | Medicine |
| food | Food | study | Study |
| family | Family | car | Car |
| shopping | Shopping | phone | Phone |
| cleaning | Cleaning | email | Email |
| task | Task (default) | calendar | Calendar |
| documents | Documents | laundry | Laundry |
| money | Money | water | Water |
| charging | Charging | sleep | Sleep |
| gift | Gift | game | Game |
| tools | Tools | idea | Idea |

Export `ICONS` as `{ key: { label, svg } }` and a `renderIcon(key)` helper. Unknown keys fall back to `task`.

---

## 9. UI / styling (`app.css`)

**Color tokens** on `:root`:

| Token | Value |
|---|---|
| `--bg` | `#0f1115` |
| `--surface` | `#181b22` |
| `--surface-2` | `#222631` |
| `--border` | `#2c3140` |
| `--text` | `#e8eaf0` |
| `--muted` | `#9aa1b2` |
| `--accent` | `#7c9cff` |
| `--success` | `#4cc38a` |
| `--warning` | `#f0b44c` (Pending) |
| `--danger` | `#ef5f5f` |

**Layout and fit:**
- Use the system font stack: `-apple-system, system-ui, Roboto, sans-serif`.
- Make all form controls `font-size: 16px` or larger. Smaller inputs make iOS zoom in on focus.
- Touch targets are at least 44×44 px. Do not use hover-only interactions.
- Respect safe areas with `env(safe-area-inset-top|bottom|left|right)`, especially on the header and bottom tab bar.
- Use `height: 100dvh`.

**Behavior:**
- Disable text selection on chrome elements.
- Set `overscroll-behavior: none` on the body. Keep scroll inside the main content.
- Bottom sheets slide up and close with a backdrop tap or a Close button.
- Use `prefers-reduced-motion` to disable animations.

**Accessibility:** use `aria-label` on icon-only buttons and real `<button>`/`<label>` elements, and keep a visible focus ring.

---

## 10. Export / import format (`io.js`)

```json
{
  "app": "task-manager-pwa",
  "schemaVersion": 2,
  "exportedAt": "2026-10-08T11:00:00.000Z",
  "tasks": [ /* Task */ ],
  "progress": { /* taskId -> date -> Occurrence */ },
  "checklists": [ /* Checklist */ ]
}
```

**Import validation:**
- `app` must match.
- `schemaVersion` must be ≤ current; older versions run through `migrate`.
- `tasks` must be an array, and every task must have an `id`, a `name` and a valid `recurrence.type`.
- `checklists`, when present, must be an array, and every checklist must have an `id` and a `name`. Schema 1 files have no checklists.
- Dates must match `/^\d{4}-\d{2}-\d{2}$/`.
- Unknown icons map to `task`.
- Drop `progress` entries for unknown task IDs.

**Behavior:** import always **replaces** the whole state, after confirmation. Export always includes quick tasks and checklists too.

---

## 11. Definition of done for any change

- [ ] `npm test` passes, and any scheduling change adds test cases.
- [ ] `CACHE_VERSION` is bumped if anything in `public/` changed, and new files are added to the precache list.
- [ ] Nothing loads from the network. In DevTools, set the network to Offline, reload, and the app still works.
- [ ] Checked at 375 px width in device emulation, with safe-area padding intact.
- [ ] No light-mode styles and no desktop-only layouts were introduced.
- [ ] Export → Delete all data → Import restores the exact same state.

---

## 12. Decisions (confirmed by the user)

- Weeks start on **Sunday**.
- Missed occurrences of recurring tasks are **skipped** when a new one is due, not stacked.
- Quick tasks appear **only on Home**, not in the Tasks list, and become Pending if not deleted on their day.
- Import **replaces** all data. There is no merge.
- Completing a task does **not** require every checklist item to be ticked.
- Checklists (the tab) are independent of tasks: CRUD only, no dates and no completion. Ticks persist until **Uncheck all**.
