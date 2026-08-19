const path = require('path');
const os = require('os');

const PORT = process.env.PROJECT_PORT || 3050;
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'webcli');
const TOKEN_FILE = path.join(DATA_DIR, 'token.txt');
const NAME_FILE = path.join(DATA_DIR, 'name.txt');
const AUTH_FLAG_FILE = path.join(DATA_DIR, 'auth-enabled');
const SECONDARY_KEY_FILE = path.join(DATA_DIR, 'secondary-key.txt');
const PID_FILE = path.join(DATA_DIR, 'server.pid');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const LOG_ENABLED_FLAG_FILE = path.join(DATA_DIR, 'log-enabled');
// Server-side (not localStorage) so the same set of quick commands shows up
// on every device that opens this machine's webcli, not just the browser
// that created them.
const QUICK_COMMANDS_FILE = path.join(DATA_DIR, 'quick-commands.json');
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS) || 7;
const MAX_SESSIONS = 10;
const MAX_NAME_LENGTH = 40;
// 24h default: a disconnected session just holds one idle shell process in
// memory (plus up to SCROLLBACK_BYTES of buffered output) until it's
// reclaimed, which is cheap enough on a personal machine that "closed the
// tab by accident, want it back tomorrow" is worth optimizing for — same
// model as tmux/screen (session persists until explicitly ended).
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 24 * 60 * 60 * 1000;

// Replayed to a reconnecting client so a page reload doesn't land on a blank
// screen while the shell underneath is still very much alive.
const SCROLLBACK_BYTES = Number(process.env.SCROLLBACK_BYTES) || 256 * 1024;
// Routers and mobile OSes silently drop idle sockets; pinging keeps them honest
// and surfaces half-open connections instead of hanging forever.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 25_000;

const USE_TLS = process.env.WEBCLI_TLS === '1';
const TLS_KEY_FILE = path.join(DATA_DIR, 'tls-key.pem');
const TLS_CERT_FILE = path.join(DATA_DIR, 'tls-cert.pem');

const UPLOAD_DIR = process.env.WEBCLI_UPLOAD_DIR || path.join(os.homedir(), 'webcli-uploads');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 64 * 1024 * 1024;

// brute-force throttle: per-IP failure budget
const AUTH_MAX_FAILS = 10;
const AUTH_WINDOW_MS = 5 * 60 * 1000;
const AUTH_LOCKOUT_MS = 5 * 60 * 1000;

module.exports = {
  PORT,
  DATA_DIR,
  TOKEN_FILE,
  NAME_FILE,
  AUTH_FLAG_FILE,
  SECONDARY_KEY_FILE,
  PID_FILE,
  LOGS_DIR,
  LOG_ENABLED_FLAG_FILE,
  QUICK_COMMANDS_FILE,
  LOG_RETENTION_DAYS,
  MAX_SESSIONS,
  MAX_NAME_LENGTH,
  RECONNECT_GRACE_MS,
  SCROLLBACK_BYTES,
  HEARTBEAT_MS,
  USE_TLS,
  TLS_KEY_FILE,
  TLS_CERT_FILE,
  UPLOAD_DIR,
  MAX_UPLOAD_BYTES,
  AUTH_MAX_FAILS,
  AUTH_WINDOW_MS,
  AUTH_LOCKOUT_MS,
};
