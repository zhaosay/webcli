const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const {
  DATA_DIR,
  TOKEN_FILE,
  NAME_FILE,
  AUTH_FLAG_FILE,
  SECONDARY_KEY_FILE,
  AUTH_MAX_FAILS,
  AUTH_WINDOW_MS,
  AUTH_LOCKOUT_MS,
} = require('./config');

function loadOrCreateToken() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(TOKEN_FILE)) {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  }
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

const TOKEN = loadOrCreateToken();

function loadName() {
  if (fs.existsSync(NAME_FILE)) {
    const saved = fs.readFileSync(NAME_FILE, 'utf8').trim();
    if (saved) return saved;
  }
  return os.hostname();
}

function saveName(name) {
  fs.writeFileSync(NAME_FILE, name);
}

function tokenMatches(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Secondary key is toggled independently via auth.sh (on/off/status) and is
// re-read from disk on every check so flipping it never requires a restart
// (a restart would kill every live pty/session).
function isAuthEnabled() {
  return fs.existsSync(AUTH_FLAG_FILE) && fs.readFileSync(AUTH_FLAG_FILE, 'utf8').trim() === '1';
}

function secondaryKeyMatches(candidate) {
  if (!fs.existsSync(SECONDARY_KEY_FILE)) return false;
  const key = fs.readFileSync(SECONDARY_KEY_FILE, 'utf8').trim();
  if (typeof candidate !== 'string' || !key) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(key);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// brute-force throttle
//
// The token is 128 bits so guessing it is not the real risk; the secondary key
// is only 64 bits, and either way an attacker who can reach the port should not
// get unlimited attempts.
// ---------------------------------------------------------------------------

const authFailures = new Map(); // ip -> { count, first, until }

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isLockedOut(ip) {
  const rec = authFailures.get(ip);
  if (!rec || !rec.until) return false;
  if (Date.now() < rec.until) return true;
  authFailures.delete(ip);
  return false;
}

function noteAuthFailure(ip) {
  const now = Date.now();
  let rec = authFailures.get(ip);
  if (!rec || now - rec.first > AUTH_WINDOW_MS) rec = { count: 0, first: now, until: 0 };
  rec.count += 1;
  if (rec.count >= AUTH_MAX_FAILS) {
    rec.until = now + AUTH_LOCKOUT_MS;
    console.warn(`[webcli] too many failed auth attempts from ${ip}, locked out for 5 min`);
  }
  authFailures.set(ip, rec);
}

// An IP that fails once (below the lockout threshold) and never comes back
// has no other cleanup path — isLockedOut() only prunes an entry when that
// same IP is checked again later. Left alone, random scanning/probing from
// many distinct source IPs grows this map forever on a long-running server.
function cleanupAuthFailures() {
  const now = Date.now();
  for (const [ip, rec] of authFailures) {
    const windowExpired = now - rec.first > AUTH_WINDOW_MS;
    const lockoutExpired = !rec.until || now >= rec.until;
    if (windowExpired && lockoutExpired) authFailures.delete(ip);
  }
}
setInterval(cleanupAuthFailures, AUTH_WINDOW_MS).unref();

// The token travels in the URL, which means a malicious page a user visits
// cannot read it — but it *can* still open a WebSocket to this origin and, if
// it ever learns the token, drive the terminal. Checking Origin costs nothing
// and blocks the drive-by case; non-browser clients send no Origin at all.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Single entry point for "is this request allowed": token, optional secondary
 * key, origin, and rate limiting. Returns { ok, status, reason }.
 */
function checkAuth(req, url, { requireOrigin = false } = {}) {
  const ip = clientIp(req);
  if (isLockedOut(ip)) return { ok: false, status: 429, reason: 'too many attempts' };
  if (requireOrigin && !sameOrigin(req)) return { ok: false, status: 403, reason: 'bad origin' };

  if (!tokenMatches(url.searchParams.get('token'))) {
    noteAuthFailure(ip);
    return { ok: false, status: 401, reason: 'invalid token' };
  }

  if (isAuthEnabled() && !secondaryKeyMatches(url.searchParams.get('key'))) {
    noteAuthFailure(ip);
    return { ok: false, status: 401, reason: 'invalid key' };
  }

  authFailures.delete(ip);
  return { ok: true };
}

module.exports = {
  TOKEN,
  loadName,
  saveName,
  tokenMatches,
  isAuthEnabled,
  secondaryKeyMatches,
  checkAuth,
  sameOrigin,
};
