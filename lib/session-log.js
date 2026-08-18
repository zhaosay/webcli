const fs = require('fs');
const path = require('path');
const { LOGS_DIR, LOG_ENABLED_FLAG_FILE, LOG_RETENTION_DAYS } = require('./config');

function isLoggingEnabled() {
  return fs.existsSync(LOG_ENABLED_FLAG_FILE) && fs.readFileSync(LOG_ENABLED_FLAG_FILE, 'utf8').trim() === '1';
}

function timestampForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Session output only (never raw keystrokes): sudo/ssh password prompts
// disable local pty echo, so they never appear in the output stream anyway.
// Logging keystrokes instead would capture those passwords in plain text.
function openLogStream(sid) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const file = path.join(LOGS_DIR, `${timestampForFilename(new Date())}_${sid.slice(0, 8)}.log`);
    const stream = fs.createWriteStream(file, { flags: 'a', mode: 0o600 });
    stream.on('error', () => {});
    return stream;
  } catch {
    return null;
  }
}

function writeConnectMarker(stream, { device, ip }) {
  if (!stream) return;
  try {
    stream.write(`\n=== connected: device=${device || 'unnamed'} ip=${ip || 'unknown'} at ${new Date().toISOString()} ===\n`);
  } catch {}
}

function writeDisconnectMarker(stream) {
  if (!stream) return;
  try {
    stream.write(`\n=== disconnected at ${new Date().toISOString()} ===\n`);
  } catch {}
}

function writeChunk(stream, data) {
  if (!stream) return;
  try {
    stream.write(data);
  } catch {}
}

function cleanupOldLogs() {
  let removed = 0;
  let files;
  try {
    files = fs.readdirSync(LOGS_DIR);
  } catch {
    return removed;
  }
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of files) {
    const file = path.join(LOGS_DIR, name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {}
  }
  return removed;
}

module.exports = {
  isLoggingEnabled,
  openLogStream,
  writeConnectMarker,
  writeDisconnectMarker,
  writeChunk,
  cleanupOldLogs,
};
