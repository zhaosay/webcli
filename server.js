const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const {
  PORT, DATA_DIR, PID_FILE, USE_TLS, TLS_KEY_FILE, TLS_CERT_FILE,
} = require('./lib/config');
const { TOKEN } = require('./lib/auth');
const { createRequestHandler } = require('./lib/routes');
const {
  handleUpgrade, shutdownAll, startHeartbeat, startTitlePoll,
} = require('./lib/pty-sessions');
const { VERSION_INFO } = require('./lib/version');
const { cleanupOldLogs } = require('./lib/session-log');
const qr = require('./lib/qr');

// Self-signed TLS is opt-in. It is not only about encrypting the LAN traffic:
// navigator.clipboard, service workers and installable PWAs all require a
// secure context, so several features only fully work under https.
function loadTlsOptions() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(TLS_KEY_FILE) && fs.existsSync(TLS_CERT_FILE)) {
    return { key: fs.readFileSync(TLS_KEY_FILE), cert: fs.readFileSync(TLS_CERT_FILE) };
  }
  const hostname = os.hostname();
  const mdns = hostname.endsWith('.local') ? hostname : `${hostname}.local`;
  const alt = ['DNS:localhost', `DNS:${hostname}`, `DNS:${mdns}`, 'IP:127.0.0.1'];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) alt.push(`IP:${net.address}`);
    }
  }
  console.log('[webcli] generating self-signed TLS certificate...');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
    '-keyout', TLS_KEY_FILE, '-out', TLS_CERT_FILE,
    '-subj', `/CN=${mdns}`,
    '-addext', `subjectAltName=${alt.join(',')}`,
  ], { stdio: 'ignore' });
  fs.chmodSync(TLS_KEY_FILE, 0o600);
  return { key: fs.readFileSync(TLS_KEY_FILE), cert: fs.readFileSync(TLS_CERT_FILE) };
}

const handler = createRequestHandler();
let tlsActive = USE_TLS;
let server;
if (USE_TLS) {
  try {
    server = https.createServer(loadTlsOptions(), handler);
  } catch (err) {
    console.error(`[webcli] TLS setup failed (is openssl installed?), falling back to http: ${err.message}`);
    tlsActive = false;
  }
}
if (!server) server = http.createServer(handler);

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head, wss);
});

const heartbeat = startHeartbeat(wss);
startTitlePoll();

function shutdown() {
  clearInterval(heartbeat);
  shutdownAll();
  try { fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));

  const proto = tlsActive ? 'https' : 'http';
  const hostname = os.hostname();
  const mdnsHost = hostname.endsWith('.local') ? hostname : `${hostname}.local`;
  const primary = `${proto}://${mdnsHost}:${PORT}/?token=${TOKEN}`;

  const commitLabel = VERSION_INFO.commit ? ` (${VERSION_INFO.commit})` : '';
  console.log(`[webcli] version: v${VERSION_INFO.version}${commitLabel}`);
  const removedLogs = cleanupOldLogs();
  if (removedLogs) console.log(`[webcli] cleaned up ${removedLogs} expired session log(s)`);
  setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000).unref();

  console.log(`[webcli] listening on 0.0.0.0:${PORT}${tlsActive ? ' (TLS, self-signed)' : ''}`);
  console.log('');
  console.log(qr.toTerminal(primary));
  console.log('');
  console.log(`[webcli] open: ${primary}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`[webcli] fallback: ${proto}://${net.address}:${PORT}/?token=${TOKEN}`);
      }
    }
  }
  if (tlsActive) console.log('[webcli] certificate is self-signed — browsers will warn once, that is expected');
});
