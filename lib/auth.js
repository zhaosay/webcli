const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const {
  DATA_DIR,
  TOKEN_FILE,
  NAME_FILE,
  AUTH_FLAG_FILE,
  SECONDARY_KEY_FILE,
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

module.exports = {
  TOKEN,
  loadName,
  saveName,
  tokenMatches,
  isAuthEnabled,
  secondaryKeyMatches,
};
