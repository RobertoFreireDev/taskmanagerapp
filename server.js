// Zero-dependency static server for public/.
// HTTP on 8080 always; HTTPS on 8443 too when certs/cert.pem and certs/key.pem exist.

import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CERT_FILE = path.join(ROOT, 'certs', 'cert.pem');
const KEY_FILE = path.join(ROOT, 'certs', 'key.pem');
const HTTP_PORT = Number(process.env.PORT) || 8080;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 8443;
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.join(PUBLIC_DIR, path.normalize(pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || pathname.includes('\0')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let info;
  try {
    info = await stat(file);
  } catch {
    info = null;
  }
  if (!info?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    log(req, 404);
    return;
  }

  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    // Always revalidate. Required for sw.js, index.html and the manifest so
    // phones see new versions; harmless for the rest (the service worker
    // caches the app shell itself and bypasses the HTTP cache when updating).
    'Cache-Control': 'no-cache',
    ETag: etag,
    'Last-Modified': info.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers).end();
    log(req, 304);
    return;
  }

  res.writeHead(200, { ...headers, 'Content-Length': info.size });
  if (req.method === 'HEAD') {
    res.end();
  } else {
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  }
  log(req, 200);
}

function log(req, status) {
  if (process.env.QUIET) return;
  const time = new Date().toLocaleTimeString();
  console.log(`${time}  ${status}  ${req.method} ${req.url}  ← ${req.socket.remoteAddress}`);
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

function listen(server, port, label) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve(label));
  });
}

async function main() {
  const onRequest = (req, res) =>
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end('Server error');
    });

  const ips = lanAddresses();
  const lines = [];

  await listen(http.createServer(onRequest), HTTP_PORT);
  lines.push(`  HTTP   http://localhost:${HTTP_PORT}`);
  for (const ip of ips) lines.push(`         http://${ip}:${HTTP_PORT}`);

  const hasCerts = existsSync(CERT_FILE) && existsSync(KEY_FILE);
  if (hasCerts) {
    const server = https.createServer({ cert: readFileSync(CERT_FILE), key: readFileSync(KEY_FILE) }, onRequest);
    await listen(server, HTTPS_PORT);
    lines.push(`  HTTPS  https://localhost:${HTTPS_PORT}`);
    for (const ip of ips) lines.push(`         https://${ip}:${HTTPS_PORT}`);
  }

  console.log('\nTask Manager is being served from public/\n');
  console.log(lines.join('\n'));
  console.log('');
  if (hasCerts) {
    console.log(`  Phones:  open the https://<LAN IP>:${HTTPS_PORT} URL above (Chrome on Android, Safari on iPhone).`);
    console.log('           The phone must trust the mkcert root CA first (certs/rootCA.crt, see README).');
    console.log(`  Android over USB also works: adb reverse tcp:${HTTP_PORT} tcp:${HTTP_PORT}, then http://localhost:${HTTP_PORT}.`);
  } else {
    console.log(`  Android: adb reverse tcp:${HTTP_PORT} tcp:${HTTP_PORT}, then open http://localhost:${HTTP_PORT} in Chrome.`);
    console.log('  HTTPS (iPhone, or Android over Wi-Fi): put mkcert files in certs/cert.pem and certs/key.pem (see README).');
  }
  console.log(`  The plain http://<LAN IP>:${HTTP_PORT} URLs are not a secure context: the app can not be installed from them.`);
  console.log('\nPress Ctrl+C to stop.\n');
}

main().catch((err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${err.port ?? ''} is already in use. Set PORT / HTTPS_PORT to use another.`);
  else console.error(err);
  process.exit(1);
});
