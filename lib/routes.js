const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const {
  MAX_NAME_LENGTH, UPLOAD_DIR, MAX_UPLOAD_BYTES, USE_TLS, PORT,
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
  start_url: '.',
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
    "connect-src 'self' ws: wss:",
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
      const auth = checkAuth(req, parsedUrl);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
      return sendJson(res, 200, { connections: listConnections() });
    }

    if (pathname === '/api/sessions' && req.method === 'GET') {
      const auth = checkAuth(req, parsedUrl);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
      return sendJson(res, 200, { sessions: listSessions() });
    }

    // Access link + a scannable QR, so the machine being controlled can show a
    // code on screen instead of the user copying a 70-character URL by hand.
    if (pathname === '/api/share' && req.method === 'GET') {
      const auth = checkAuth(req, parsedUrl);
      if (!auth.ok) return sendJson(res, auth.status, { error: auth.reason });
      const host = req.headers.host || `localhost:${PORT}`;
      const link = `${USE_TLS ? 'https' : 'http'}://${host}/?token=${TOKEN}`;
      return sendJson(res, 200, { url: link, qr: qr.toSvg(link) });
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      return handleUpload(req, res, parsedUrl).catch(() => {
        if (!res.headersSent) sendJson(res, 500, { error: 'upload failed' });
      });
    }

    if (pathname === '/') return serveAsset(req, res, '/index.html');
    if (assets.has(pathname)) return serveAsset(req, res, pathname);

    res.writeHead(404, SECURITY_HEADERS);
    return res.end('Not found');
  };
}

module.exports = { createRequestHandler };
