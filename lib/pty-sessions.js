const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const pty = require('node-pty');
const { MAX_SESSIONS, RECONNECT_GRACE_MS } = require('./config');
const { tokenMatches, isAuthEnabled, secondaryKeyMatches } = require('./auth');

// sid -> { pty, ws, killTimer }
// A session survives a dropped WebSocket for RECONNECT_GRACE_MS so a brief
// network blip (wifi hiccup, laptop sleep, phone lock) doesn't kill the shell
// underneath the user. It's only torn down for real when the grace period
// expires with no reconnect, or the shell process exits on its own.
const sessions = new Map();

function spawnPty() {
  const shell = process.platform === 'win32'
    ? (process.env.COMSPEC || 'cmd.exe')
    : (process.env.SHELL || '/bin/zsh');
  return pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env,
  });
}

function attachSocket(entry, ws, meta) {
  if (entry.killTimer) {
    clearTimeout(entry.killTimer);
    entry.killTimer = null;
  }
  if (entry.ws && entry.ws !== ws && entry.ws.readyState === WebSocket.OPEN) {
    entry.ws.close(1000, 'replaced by reconnect');
  }
  entry.ws = ws;
  entry.device = meta.device;
  entry.ip = meta.ip;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'input' && typeof msg.data === 'string') {
      entry.pty.write(msg.data);
    } else if (msg.type === 'resize' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
      entry.pty.resize(msg.cols, msg.rows);
    }
  });

  const scheduleKill = () => {
    entry.ws = null;
    entry.killTimer = setTimeout(() => {
      sessions.delete(entry.sid);
      try { entry.pty.kill(); } catch {}
    }, RECONNECT_GRACE_MS);
  };
  ws.on('close', scheduleKill);
  ws.on('error', scheduleKill);
}

function createSession(sid) {
  let ptyProcess;
  try {
    ptyProcess = spawnPty();
  } catch (err) {
    return { error: err };
  }

  const entry = { sid, pty: ptyProcess, ws: null, killTimer: null, device: null, ip: null, connectedAt: Date.now() };
  sessions.set(sid, entry);

  ptyProcess.onData((data) => {
    if (entry.ws && entry.ws.readyState === WebSocket.OPEN) entry.ws.send(data);
  });
  ptyProcess.onExit(() => {
    if (entry.killTimer) clearTimeout(entry.killTimer);
    sessions.delete(sid);
    if (entry.ws && entry.ws.readyState === WebSocket.OPEN) entry.ws.close(1000, 'shell exited');
  });

  return { entry };
}

function handleUpgrade(req, socket, head, wss) {
  const url = new URL(req.url, 'http://localhost');
  const candidate = url.searchParams.get('token');

  if (!tokenMatches(candidate)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (isAuthEnabled() && !secondaryKeyMatches(url.searchParams.get('key'))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  let sid = url.searchParams.get('sid');
  if (typeof sid !== 'string' || !sid) sid = crypto.randomUUID();

  const existing = sessions.get(sid);
  if (!existing && sessions.size >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  const meta = {
    device: (url.searchParams.get('device') || '').slice(0, 40) || null,
    ip: req.socket.remoteAddress,
  };

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (existing) {
      attachSocket(existing, ws, meta);
      return;
    }
    const { entry, error } = createSession(sid);
    if (error) {
      ws.close(1011, 'failed to start shell');
      return;
    }
    attachSocket(entry, ws, meta);
  });
}

function listConnections() {
  return [...sessions.values()]
    .filter((entry) => entry.ws && entry.ws.readyState === WebSocket.OPEN)
    .map((entry) => ({ device: entry.device, ip: entry.ip, connectedAt: entry.connectedAt }));
}

function shutdownAll() {
  for (const entry of sessions.values()) {
    if (entry.killTimer) clearTimeout(entry.killTimer);
    try { entry.pty.kill(); } catch {}
  }
  sessions.clear();
}

module.exports = { handleUpgrade, shutdownAll, listConnections };
