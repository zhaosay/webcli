const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const {
  MAX_NAME_LENGTH, UPLOAD_DIR, MAX_UPLOAD_BYTES, USE_TLS, PORT, DATA_DIR, QUICK_COMMANDS_FILE,
} = require('./config');
const {
  TOKEN, isAuthEnabled, loadName, saveName, checkAuth,
} = require('./auth');
const { VERSION_INFO } = require('./version');
const { listConnections, listSessions } = require('./pty-sessions');
const qr = require('./qr');
const icon = require('./icon');

// ---------------------------------------------------------------------------
// static assets
//
// Precompressed and ETagged at startup: xterm.js alone is ~290KB uncompressed
// and phones were re-downloading it on every reload.
// ---------------------------------------------------------------------------

const assets = new Map();

function registerAsset(route, buf, type, { immutable = false } = {}) {
  const etag = `"${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20)}"`;
  const compressible = /^(text\/|application\/(javascript|json|manifest))/.test(type);
  assets.set(route, {
    buf,
    gz: compressible ? zlib.gzipSync(buf, { level: 9 }) : null,
    etag,
    type,
    cacheControl: immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
}

const MANIFEST = JSON.stringify({
  name: 'webcli',
  short_name: 'webcli',
  description: 'Fully interactive terminal for this machine, in a browser',
  // Relative to the manifest's own URL, not the page that linked it, so the
  // query string has to be embedded here explicitly — otherwise "add to home
  // screen" launches at bare '/' with no token and lands on the manual entry
  // gate instead of the terminal. The token is one shared secret per machine
  // (not per-user), so baking it into a manifest served alongside the app is
  // no different a trust boundary than the access link itself.
  start_url: `.?token=${TOKEN}`,
  scope: '.',
  display: 'standalone',
  background_color: '#09090b',
  theme_color: '#09090b',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

const SERVICE_WORKER = `
const CACHE = 'webcli-v1';
const ASSETS = ['/vendor/xterm.js', '/vendor/xterm.css', '/vendor/addon-fit.js',
  '/vendor/addon-search.js', '/icon-192.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !url.pathname.startsWith('/vendor/')) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
`;

function buildAssets() {
  const html = path.join(__dirname, '..', 'public', 'index.html');
  registerAsset('/index.html', fs.readFileSync(html), 'text/html; charset=utf-8');
  const vendor = {
    '/vendor/xterm.js': ['@xterm/xterm/lib/xterm.js', 'application/javascript; charset=utf-8'],
    '/vendor/xterm.css': ['@xterm/xterm/css/xterm.css', 'text/css; charset=utf-8'],
    '/vendor/addon-fit.js': ['@xterm/addon-fit/lib/addon-fit.js', 'application/javascript; charset=utf-8'],
    '/vendor/addon-search.js': ['@xterm/addon-search/lib/addon-search.js', 'application/javascript; charset=utf-8'],
  };
  for (const [route, [mod, type]] of Object.entries(vendor)) {
    registerAsset(route, fs.readFileSync(require.resolve(mod)), type, { immutable: true });
  }
  registerAsset('/manifest.webmanifest', Buffer.from(MANIFEST), 'application/manifest+json; charset=utf-8');
  registerAsset('/sw.js', Buffer.from(SERVICE_WORKER), 'application/javascript; charset=utf-8');
  registerAsset('/icon-192.png', icon.render(192), 'image/png', { immutable: true });
  registerAsset('/icon-512.png', icon.render(512), 'image/png', { immutable: true });
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // the token lives in the URL — never hand it to a third party via Referer
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // 'self' already covers same-origin ws:/wss: (scheme is normalized to
    // http/https for origin matching) — a bare "ws: wss:" would allow a
    // connection to any host, not just this one, undermining exactly the
    // XSS mitigation this header is meant to provide.
    "connect-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(JSON.stringify(obj));
}

function serveAsset(req, res, route) {
  const asset = assets.get(route);
  if (!asset) {
    res.writeHead(404, SECURITY_HEADERS);
    res.end('Not found');
    return;
  }
  const headers = {
    'Content-Type': asset.type,
    'Cache-Control': asset.cacheControl,
    ETag: asset.etag,
    Vary: 'Accept-Encoding',
    ...SECURITY_HEADERS,
  };
  if (req.headers['if-none-match'] === asset.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const body = asset.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')
    ? (headers['Content-Encoding'] = 'gzip', asset.gz)
    : asset.buf;
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

// ---------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function handleName(req, res, parsedUrl) {
  if (req.method === 'GET') {
    sendJson(res, 200, { name: loadName() });
    return;
  }
  const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.reason });
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024) req.destroy();
  });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (!name) {
      sendJson(res, 400, { error: 'name required' });
      return;
    }
    saveName(name);
    sendJson(res, 200, { name });
  });
}

async function handleUpload(req, res, parsedUrl) {
  const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });

  const rawName = String(req.headers['x-webcli-filename'] || 'upload.bin');
  // never trust a client-supplied filename: drop directories and odd characters
  const safe = path.basename(decodeURIComponent(rawName))
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120) || 'upload.bin';

  let body;
  try {
    body = await readBody(req, MAX_UPLOAD_BYTES);
  } catch {
    return sendJson(res, 413, { error: 'file too large' });
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let target = path.join(UPLOAD_DIR, safe);
  let n = 1;
  while (fs.existsSync(target)) target = path.join(UPLOAD_DIR, `${stem}-${n++}${ext}`);
  fs.writeFileSync(target, body);
  return sendJson(res, 200, { path: target, bytes: body.length });
}

const MAX_QUICK_COMMANDS = 30;

function loadQuickCommands() {
  try {
    if (!fs.existsSync(QUICK_COMMANDS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(QUICK_COMMANDS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQuickCommands(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(QUICK_COMMANDS_FILE, JSON.stringify(list));
}

async function handleQuickCommands(req, res, parsedUrl) {
  const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });

  if (req.method === 'GET') {
    return sendJson(res, 200, { commands: loadQuickCommands() });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = JSON.parse((await readBody(req, 4096)).toString('utf8'));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 20) : '';
    const command = typeof body.command === 'string' ? body.command.trim().slice(0, 200) : '';
    const cwd = typeof body.cwd === 'string' ? body.cwd.trim().slice(0, 200) : '';
    if (!label || !command) return sendJson(res, 400, { error: 'label and command required' });
    const list = loadQuickCommands();
    if (list.length >= MAX_QUICK_COMMANDS) return sendJson(res, 400, { error: 'too many quick commands' });
    list.push({ id: crypto.randomBytes(6).toString('hex'), label, command, cwd });
    saveQuickCommands(list);
    return sendJson(res, 200, { commands: list });
  }

  if (req.method === 'DELETE') {
    let body;
    try {
      body = JSON.parse((await readBody(req, 4096)).toString('utf8'));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const id = typeof body.id === 'string' ? body.id : '';
    saveQuickCommands(loadQuickCommands().filter((c) => c.id !== id));
    return sendJson(res, 200, { commands: loadQuickCommands() });
  }

  return sendJson(res, 405, { error: 'method not allowed' });
}

const PROJECT_ROOT = path.join(__dirname, '..');
const RUN_LOG_FILE = path.join(PROJECT_ROOT, '.run', 'run.log');

// Detached + unref'd: the script outlives this request (and this process,
// once restart.sh gets around to killing it) instead of being tied to the
// HTTP response lifecycle. update.sh in particular chains straight through
// `exec` (update.sh -> restart.sh -> start.sh -> node server.js) rather than
// spawning a fresh child, so whatever stdio this first spawn is given is what
// the *eventual long-running server* is stuck with — 'ignore' would silently
// swallow every log line (startup banner, QR code, errors) from the new
// process forever. Route it into the same log file the control panel's
// restart.sh --bg / "8 查看日志" already read from instead.
function triggerScript(script, args) {
  fs.mkdirSync(path.dirname(RUN_LOG_FILE), { recursive: true });
  const logFd = fs.openSync(RUN_LOG_FILE, 'a');
  const child = spawn(script, args, { cwd: PROJECT_ROOT, detached: true, stdio: ['ignore', logFd, logFd] });
  fs.closeSync(logFd);
  child.unref();
}

// Anyone who can reach these already has a full shell via the terminal
// itself — `git pull && ./restart.sh` typed by hand has the exact same
// effect — so this isn't a new privilege boundary, just a one-click version
// of something already possible. Still requires the normal token +
// same-origin check like every other state-changing endpoint.
function handleServiceAction(req, res, parsedUrl, action) {
  const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
  if (action === 'update') triggerScript('./update.sh', []);
  else triggerScript('./restart.sh', ['--bg']);
  return sendJson(res, 200, { ok: true });
}

function createRequestHandler() {
  buildAssets();

  return (req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/auth-status' && req.method === 'GET') {
      return sendJson(res, 200, { enabled: isAuthEnabled() });
    }

    if (pathname === '/api/version' && req.method === 'GET') {
      return sendJson(res, 200, VERSION_INFO);
    }

    if (pathname === '/api/name' && (req.method === 'GET' || req.method === 'POST')) {
      return handleName(req, res, parsedUrl);
    }

    if (pathname === '/api/connections' && req.method === 'GET') {
      const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
      return sendJson(res, 200, { connections: listConnections() });
    }

    if (pathname === '/api/sessions' && req.method === 'GET') {
      const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
      return sendJson(res, 200, { sessions: listSessions() });
    }

    // Access link + a scannable QR, so the machine being controlled can show a
    // code on screen instead of the user copying a 70-character URL by hand.
    // requireOrigin matters extra here since the response echoes TOKEN itself.
    if (pathname === '/api/share' && req.method === 'GET') {
      const auth = checkAuth(req, parsedUrl, { requireOrigin: true });
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
      const host = req.headers.host || `localhost:${PORT}`;
      const link = `${USE_TLS ? 'https' : 'http'}://${host}/?token=${TOKEN}`;
      return sendJson(res, 200, { url: link, qr: qr.toSvg(link) });
    }

    if (pathname === '/api/quick-commands' && ['GET', 'POST', 'DELETE'].includes(req.method)) {
      return handleQuickCommands(req, res, parsedUrl).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: 'quick commands failed' });
      });
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      return handleUpload(req, res, parsedUrl).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: 'upload failed' });
      });
    }

    if (pathname === '/api/restart' && req.method === 'POST') {
      return handleServiceAction(req, res, parsedUrl, 'restart');
    }

    if (pathname === '/api/update' && req.method === 'POST') {
      return handleServiceAction(req, res, parsedUrl, 'update');
    }

    if (pathname === '/') return serveAsset(req, res, '/index.html');
    if (assets.has(pathname)) return serveAsset(req, res, pathname);

    res.writeHead(404, SECURITY_HEADERS);
    return res.end('Not found');
  };
}

module.exports = { createRequestHandler };
