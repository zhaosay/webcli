const path = require('path');

const PORT = process.env.PROJECT_PORT || 3050;
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'webcli');
const TOKEN_FILE = path.join(DATA_DIR, 'token.txt');
const NAME_FILE = path.join(DATA_DIR, 'name.txt');
const AUTH_FLAG_FILE = path.join(DATA_DIR, 'auth-enabled');
const SECONDARY_KEY_FILE = path.join(DATA_DIR, 'secondary-key.txt');
const MAX_SESSIONS = 10;
const MAX_NAME_LENGTH = 40;
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 30_000;

module.exports = {
  PORT,
  DATA_DIR,
  TOKEN_FILE,
  NAME_FILE,
  AUTH_FLAG_FILE,
  SECONDARY_KEY_FILE,
  MAX_SESSIONS,
  MAX_NAME_LENGTH,
  RECONNECT_GRACE_MS,
};
