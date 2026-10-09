# Task Manager

An offline task manager for your phone, with a dark theme. You install it to the home screen of an Android phone or iPhone from a small server on your PC. It does not go through an app store, and it has no account, no cloud and no sync. All data stays on the phone. To move data between devices, export a backup file and import it on the other device.

- **Home**: your habit **Characters** at the top, then today's tasks in three sections: **To do**, **Pending** (missed and not done yet) and **Done**. Mark a task **Not done** when you know you'll skip it; it moves to a **Not done** section and counts against your characters right away. Use **+ Quick task** for one-off tasks. Below them, write today's **Journal** entry.
- **Tasks**: recurring tasks. Each one can repeat once, daily, weekly, monthly or yearly, every N days, weeks, months or years. Tasks can have notes and a checklist.
- **Checklists**: reusable lists for double-checking you haven't missed anything, such as a packing list for a trip. Tick items off, then **Uncheck all** to use the list again. They have no dates and never appear on Home.
- **Journal**: a few lines a day, up to 3 feelings (from 32) and your energy level (0–100% in 8 steps). Browse a month at a time on a calendar, jump to any month or year, and fill in a day you missed. Text saves as you type.
- **Habits**: create characters (kid, woman, man, cat, dog or bird) and attach your tasks to them. Each completed task earns the character XP, and each missed one costs XP, so it levels up (or down) with your habits. Choose how much XP each level needs, and a status for each result (💪 Strong when you go to the gym, 🥀 Weak when you skip it — 64 to pick from). A character is happy, normal or sad depending on how many tasks you missed in the last day, week, month or year.
- **Settings**: back up (tasks, progress, checklists, journal and characters), restore, check for updates, and delete all data.

## Requirements

- **Node.js 20 or newer** on the PC. The project has no dependencies, so there is nothing to `npm install`.
- **[mkcert](https://github.com/FiloSottile/mkcert)** on the PC, to create the HTTPS certificate.
- The phone and the PC on the **same Wi-Fi network**. Guest networks often block devices from reaching each other, so use the main network.

## How it works

Both Android and iPhone install the app over **HTTPS on your Wi-Fi**, from `https://<PC-LAN-IP>:8443`. A PWA works offline only in a **secure context**, and a plain address such as `http://192.168.1.20:8080` is not one. From a plain HTTP address the app can't be installed, and it stops working as soon as the PC server stops.

The setup has three steps:

1. [Create the HTTPS certificate](#1-create-the-https-certificate) on the PC (once).
2. Make the phone trust it and install the app: [Android](#2a-install-on-android) or [iPhone](#2b-install-on-iphone).
3. Use the app. It works offline, so the PC only needs to be on when you install or update.

## Run the server

```sh
npm start      # serves public/ and prints every LAN URL
npm test       # runs the scheduling, storage and import/export tests
```

When `certs/cert.pem` and `certs/key.pem` exist, the server serves HTTPS on port **8443**. It also serves plain HTTP on port 8080, but don't use that address on the phone. To use other ports, set `HTTPS_PORT` and `PORT`.

> **Windows:** the first time you run the server, Windows Firewall may ask whether to allow Node.js. Allow it on **private networks**, or the phone can't reach the PC. Also check that Windows treats your Wi-Fi as a **Private** network, not Public.

---

## 1. Create the HTTPS certificate

Do this once on the PC. Before you start, give your PC a **fixed IP address**, for example with a DHCP reservation on your router. The certificate and the app's address both depend on that IP.

1. Install mkcert: `winget install FiloSottile.mkcert` on Windows or `brew install mkcert` on macOS. Open a new terminal afterwards.
2. Find your PC's Wi-Fi IP address, for example `192.168.1.20`. Run `ipconfig` on Windows or `ipconfig getifaddr en0` on macOS. `npm start` also prints it.
3. In the project folder, create the certificate and copy the CA file for the phone. Replace `<PC-LAN-IP>` with your IP. In PowerShell:
   ```powershell
   New-Item -ItemType Directory -Force certs | Out-Null
   mkcert -cert-file certs/cert.pem -key-file certs/key.pem <PC-LAN-IP> localhost 127.0.0.1
   Copy-Item "$(mkcert -CAROOT)\rootCA.pem" certs\rootCA.crt
   ```
   On macOS or Linux:
   ```sh
   mkdir -p certs
   mkcert -cert-file certs/cert.pem -key-file certs/key.pem <PC-LAN-IP> localhost 127.0.0.1
   cp "$(mkcert -CAROOT)/rootCA.pem" certs/rootCA.crt
   ```
   The `certs/` folder is gitignored.
4. Run `npm start`. The output should now include an `https://<PC-LAN-IP>:8443` line.
5. Optional: `mkcert -install` also makes the PC's own browsers trust the certificate. Phones don't need it.

**Only `rootCA.crt` (the same file as `rootCA.pem`) goes to phones.** Never share `rootCA-key.pem` from the `mkcert -CAROOT` folder: anyone with that key can create certificates your phone will trust.

If the PC's IP changes, run step 3 again with the new IP. The phones keep trusting the same `rootCA.crt`, so you don't need to send it again. The app at the new address starts empty, so move your data with a backup.

---

## 2a. Install on Android

1. Send **`certs/rootCA.crt`** to the phone, for example by email, Google Drive or a chat app, and save it to the phone's storage.
2. On the phone, install it as a **CA certificate**:
   - **Pixel:** Settings → Security & privacy → More security & privacy → Encryption & credentials → Install a certificate → **CA certificate** → Install anyway.
   - **Samsung:** Settings → Security and privacy → More security settings → Install from device storage → **CA certificate**.
   - **Other phones:** search Settings for "CA certificate".

   Android may ask you to set a screen lock first.
3. On the PC, run `npm start`.
4. In **Chrome** on the phone, open `https://<PC-LAN-IP>:8443`. It should load with no certificate warning.
5. Open the menu **⋮** and tap **Install app**. If the dialog offers both, choose **Install**, not **Create shortcut**. A real install appears in the app drawer and opens without an address bar.

---

## 2b. Install on iPhone

iOS installs the app from **Safari** only.

1. Send **`certs/rootCA.crt`** to the iPhone by AirDrop or email, then open it on the phone. iOS says "Profile Downloaded".
2. Open **Settings → General → VPN & Device Management**, tap the downloaded profile and tap **Install**.
3. Open **Settings → General → About → Certificate Trust Settings** and turn on full trust for the mkcert certificate.
4. On the PC, run `npm start`.
5. In **Safari** on the iPhone, open `https://<PC-LAN-IP>:8443`. It should load with no certificate warning.
6. Tap **Share → Add to Home Screen**.
7. Open the app **from the home screen once while the PC server is still running**, so it can save itself for offline use.

---

## Your data and backups

- Data belongs to the app's **address**: the protocol, host and port together. If you open the app at a different IP or port, you get a new, empty app.
- On iPhone, the home-screen app has **its own storage, separate from Safari**. Import backups inside the installed app.
- **Deleting the app from the home screen deletes its data.** Export a backup regularly from **Settings**:
  - **Share backup…** opens the system share sheet, so you can send the file to WhatsApp, Drive, Mail and so on. This button appears only when the browser can share files; Chrome on Android may not offer it for `.json` files.
  - **Download backup** saves `tasks-backup-YYYY-MM-DD.json`.
- **Import backup…** checks the file, shows a summary, and then **replaces** all data in the app after you confirm. It never merges.
- On first run the app asks the browser for persistent storage, so the browser does not clear the data on its own. Settings shows whether the browser granted it.

## Updating the app on your phone

1. Change the files in `public/`, then **bump `CACHE_VERSION`** in `public/sw.js`, for example `'v1'` → `'v2'`. Without this step, installed phones keep the old version.
2. Run `npm start` on the PC, with the phone on the same Wi-Fi. The PC must have the **same IP as when you installed**, so the app's address `https://<PC-LAN-IP>:8443` stays the same.
3. In the app, go to **Settings → Check for updates**. When the toast **"Update available — Reload"** appears, tap **Reload**.

The app also checks for updates by itself each time it starts while the server is reachable.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm start` prints no `https://` line | `certs/cert.pem` and `certs/key.pem` are missing. Follow [Create the HTTPS certificate](#1-create-the-https-certificate). |
| The phone can't open the page | Check that the phone and PC are on the same Wi-Fi (not a guest network), allow Node.js through the PC firewall, and use the `https://…:8443` address printed by `npm start`. |
| Chrome or Safari says the connection is not private | The phone doesn't trust the mkcert CA yet. On Android, install `certs/rootCA.crt` as a **CA certificate**. On iPhone, repeat steps 1–3, including **Certificate Trust Settings**. Also check that you opened the IP the certificate was made for. |
| Chrome shows no **Install app** option | You're on a plain `http://` address. Open `https://<PC-LAN-IP>:8443` instead. |
| The home-screen icon opens with an address bar | It is a shortcut, not an install. Remove it and install again from `https://<PC-LAN-IP>:8443`. |
| The app is empty after reinstalling or changing IP | Each address has its own storage. Import your latest backup. |
| Changes don't show up on the phone | Bump `CACHE_VERSION` in `public/sw.js`, then use **Check for updates**. |
| `Port 8443 is already in use` (or 8080) | Stop the other server, or pick other ports: `HTTPS_PORT=8444 PORT=8081 npm start`. On Windows PowerShell: `$env:HTTPS_PORT=8444; $env:PORT=8081; npm start`. The app at a new port starts empty, so move your data with a backup. |

## Development

The project has no build step and no dependencies. It is plain HTML, CSS and JavaScript ES modules in `public/`, and the only tooling is Node's built-in modules (`server.js` and the tests).

```
server.js               zero-dependency static server (HTTP + optional HTTPS)
tests/                  node --test (scheduling rules, habits, storage, import/export)
public/
  index.html, manifest.webmanifest, sw.js, css/app.css, img/
  js/app.js             boot, router, tab bar, service worker updates
  js/dates.js           local-date helpers (the only place that builds date keys)
  js/schedule.js        pure scheduling rules (isDue, Home sections)
  js/store.js           state, migrations, localStorage
  js/io.js              backup export / import / share
  js/icons.js           inline SVG icons (Lucide, ISC license)
  js/moods.js           journal emotions (emoji) and energy levels
  js/statuses.js        character avatars and statuses (emoji)
  js/habits.js          pure habit rules (XP, levels, mood, statuses)
  js/ui.js              DOM helpers, sheets, dialogs, toasts
  js/screens/           home, tasks, task-form, checklists, checklist-view, checklist-form, journal, journal-day,
                        habits, character-view, character-form, habit-form, settings
```

See [CLAUDE.md](CLAUDE.md) for the full spec and project rules.
