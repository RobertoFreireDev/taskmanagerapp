# Task Manager

An offline task manager for your phone, with a dark theme. You install it to the home screen of an Android phone or iPhone from a small server on your PC. It does not go through an app store, and it has no account, no cloud and no sync. All data stays on the phone. To move data between devices, export a backup file and import it on the other device.

- **Home**: today's tasks in three sections: **To do**, **Pending** (missed and not done yet) and **Done**. Use **+ Quick task** for one-off tasks.
- **Tasks**: recurring tasks. Each one can repeat once, daily, weekly, monthly or yearly, every N days, weeks, months or years. Tasks can have notes and a checklist.
- **Settings**: back up, restore, check for updates, and delete all data.

## Requirements

- **Node.js 20 or newer** on the PC. The project has no dependencies, so there is nothing to `npm install`.
- The phone and the PC must be on the **same Wi-Fi network**, or connected by USB (Android only).
- Extra tools, depending on the phone:
  - **Android**: [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) (`adb`).
  - **iPhone**: [mkcert](https://github.com/FiloSottile/mkcert) or [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

## Run the server

```sh
npm start      # serves public/ on http://0.0.0.0:8080 and prints every LAN URL
npm test       # runs the scheduling and import/export tests
```

If `certs/cert.pem` and `certs/key.pem` exist, the server also serves HTTPS on port **8443**. To use other ports, set `PORT` and `HTTPS_PORT`.

> **Windows:** the first time you run the server, Windows Firewall may ask whether to allow Node.js. Allow it on **private networks**, or the phone can't reach the PC.

## Why the install method matters

A PWA works offline only in a **secure context**: either HTTPS or the exact address `http://localhost`. A plain address such as `http://192.168.1.20:8080` is not secure, so on that address:

- offline mode doesn't work, and the app breaks as soon as the PC server stops;
- the app can't be properly installed.

So, can you install it without a certificate? **On Android, yes. On iPhone, no.** Follow the steps for your phone.

---

## Android

### Option A: HTTPS certificate over Wi-Fi

No cable and no Chrome flags. You create the certificate once, as described in [HTTPS certificate (mkcert)](#https-certificate-mkcert) below.

1. Send **`certs/rootCA.crt`** to the phone, by USB file transfer, Drive or email. If the phone is connected with USB debugging on, you can also run `adb push certs/rootCA.crt /sdcard/Download/`.
2. On the phone, install it as a **CA certificate**. On Pixel phones the path is **Settings → Security & privacy → More security & privacy → Encryption & credentials → Install a certificate → CA certificate → Install anyway**. On Samsung phones it is **Settings → Security and privacy → More security settings → Install from device storage → CA certificate**. On other phones, search Settings for "CA certificate". Android may ask you to set a screen lock first.
3. On the PC, run `npm start`. The output should include an `https://<PC-LAN-IP>:8443` line.
4. In **Chrome** on the phone, open `https://<PC-LAN-IP>:8443`. It should load with no certificate warning.
5. Open the menu **⋮** and tap **Install app**. If the dialog offers both, choose **Install**, not **Create shortcut**. A real install appears in the app drawer and opens without an address bar.

### Option B: USB with `adb reverse` (no certificate)

1. On the phone, turn on **Developer options → USB debugging**. To show Developer options, tap **Settings → About phone → Build number** seven times. Then connect the phone to the PC with a USB cable and accept the prompt on the phone.
2. On the PC, run:
   ```sh
   npm start
   adb reverse tcp:8080 tcp:8080
   ```
   `adb` comes with [platform-tools](https://developer.android.com/tools/releases/platform-tools). On Windows, `winget install Google.PlatformTools` installs it; open a new terminal afterwards.
3. On the phone, open **`http://localhost:8080`** in **Chrome**. Because the address is `localhost`, Chrome treats it as secure.
4. Open the Chrome menu **⋮** and tap **Install app**.
5. Done. You can unplug the cable, and the app works offline from the home-screen icon.

### Option C: Wi-Fi, by telling Chrome to trust your PC's address

1. On the PC, run `npm start` and note the LAN URL it prints, for example `http://192.168.1.20:8080`.
2. On the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` in Chrome.
3. Enter the URL from step 1 and set the flag to **Enabled**. Then tap **Relaunch**.
4. Open that URL, then use **⋮ → Install app**.

> If the home-screen icon opens with Chrome's address bar, it is a **shortcut**, not an installed app. This happens when you add it from a plain `http://<IP>:8080` address. Remove the icon and install again with one of the options above.

---

## HTTPS certificate (mkcert)

You need this for every iPhone install, and for Android Option A. Before you start, give your PC a **fixed IP address**, for example with a DHCP reservation on your router. The certificate and the app's address both depend on that IP.

1. Install mkcert on the PC: `winget install FiloSottile.mkcert` on Windows or `brew install mkcert` on macOS. Open a new terminal afterwards.
2. In the project folder, create the certificate and copy the CA file for the phone. In PowerShell:
   ```powershell
   mkcert -cert-file certs/cert.pem -key-file certs/key.pem <PC-LAN-IP> localhost 127.0.0.1
   Copy-Item "$(mkcert -CAROOT)ootCA.pem" certsootCA.crt
   ```
   On macOS or Linux, the copy command is `cp "$(mkcert -CAROOT)/rootCA.pem" certs/rootCA.crt`. Replace `<PC-LAN-IP>` with your PC's address, for example `192.168.1.20`. The `certs/` folder is gitignored.
3. Optional: `mkcert -install` also makes the PC's own browsers trust the certificate. Phones don't need it.

**Only `rootCA.crt` (the same file as `rootCA.pem`) goes to phones.** Never share `rootCA-key.pem` from the `mkcert -CAROOT` folder: anyone with that key can create certificates your phone will trust. If the PC's IP changes, run step 2 again with the new IP. The app at the new address starts empty, so move your data with a backup.

---

## iPhone (needs HTTPS)

iOS installs the app from **Safari** only.

### Option A: mkcert (fully local, recommended)

1. Create the certificate as described in [HTTPS certificate (mkcert)](#https-certificate-mkcert).
2. Send **`certs/rootCA.crt`** to the iPhone by AirDrop or email, then open it on the phone.
3. On the iPhone, open **Settings → General → VPN & Device Management**, tap the downloaded profile and tap **Install**.
4. Open **Settings → General → About → Certificate Trust Settings** and turn on full trust for the mkcert certificate.
5. On the PC, run `npm start`. The output should now include an `https://<PC-LAN-IP>:8443` line.
6. On the iPhone, open `https://<PC-LAN-IP>:8443` in **Safari** and tap **Share → Add to Home Screen**.
7. Open the app **from the home screen once while the PC server is still running**, so it can save itself for offline use.

### Option B: HTTPS tunnel (needs internet only during install)

```sh
npm start
cloudflared tunnel --url http://localhost:8080
```

Open the printed `https://….trycloudflare.com` URL in Safari, then tap **Share → Add to Home Screen**.

> **Caution:** the tunnel URL changes every time you run cloudflared, and each URL counts as a different app with its own, empty storage. Install once and keep that home-screen app. To move to a new URL, export a backup from the old app and import it in the new one.

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
2. Start the server, and make sure the phone can reach it at the **same address as before**. On Android with USB, run `adb reverse tcp:8080 tcp:8080` again.
3. In the app, go to **Settings → Check for updates**. When the toast **"Update available — Reload"** appears, tap **Reload**.

The app also checks for updates by itself each time it starts while the server is reachable.

## Troubleshooting

| Problem | Fix |
|---|---|
| Chrome shows no **Install app** option | You're not on a secure address. Use `http://localhost:8080` through `adb reverse`, or enable the Chrome flag (Android Option B). |
| The phone can't open the page | Check that the phone and PC are on the same Wi-Fi, allow Node.js through the PC firewall, and use the IP printed by `npm start`. |
| Chrome or Safari says the connection is not private | The phone doesn't trust the mkcert CA yet. On Android, install `certs/rootCA.crt` as a CA certificate. On iPhone, repeat steps 2–4, including **Certificate Trust Settings**. Also check that you opened the IP the certificate was made for. |
| The home-screen icon opens with an address bar | It is a shortcut, not an install. Remove it and install from `https://<PC-LAN-IP>:8443` (or `localhost` over USB) with **Install app**. |
| The app is empty after reinstalling or changing IP | Each address has its own storage. Import your latest backup. |
| Changes don't show up on the phone | Bump `CACHE_VERSION` in `public/sw.js`, then use **Check for updates**. |
| `Port 8080 is already in use` | Stop the other server, or run `PORT=8081 npm start`. On Windows PowerShell: `$env:PORT=8081; npm start`. |

## Development

The project has no build step and no dependencies. It is plain HTML, CSS and JavaScript ES modules in `public/`, and the only tooling is Node's built-in modules (`server.js` and the tests).

```
server.js               zero-dependency static server (HTTP + optional HTTPS)
tests/                  node --test (scheduling rules, import/export)
public/
  index.html, manifest.webmanifest, sw.js, css/app.css, img/
  js/app.js             boot, router, tab bar, service worker updates
  js/dates.js           local-date helpers (the only place that builds date keys)
  js/schedule.js        pure scheduling rules (isDue, Home sections)
  js/store.js           state, migrations, localStorage
  js/io.js              backup export / import / share
  js/icons.js           inline SVG icons (Lucide, ISC license)
  js/ui.js              DOM helpers, sheets, dialogs, toasts
  js/screens/           home, tasks, task-form, settings
```

See [CLAUDE.md](CLAUDE.md) for the full spec and project rules.
