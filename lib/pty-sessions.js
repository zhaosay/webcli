const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const pty = require('node-pty');
const {
  MAX_SESSIONS, RECONNECT_GRACE_MS, SCROLLBACK_BYTES, HEARTBEAT_MS,
} = require('./config');
const { checkAuth } = require('./auth');
const {
  isLoggingEnabled, openLogStream, writeConnectMarker, writeDisconnectMarker, writeChunk,
} = require('./session-log');

// sid -> { pty, viewers, killTimer, buffer, ... }
// A session survives a dropped WebSocket for RECONNECT_GRACE_MS so a brief
// network blip (wifi hiccup, laptop sleep, phone lock) doesn't kill the shell
// underneath the user. It's only torn down for real when the grace period
// expires with nobody attached, or the shell process exits on its own.
//
// `viewers` is a Set rather than a single socket so the same terminal can be
// watched from several devices at once (laptop + phone); the pty is sized to
// the smallest attached viewport, the way tmux does it.
const sessions = new Map();

function spawnPty(cols, rows) {
  const shell = process.platform === 'win32'
    ? (process.env.COMSPEC || 'cmd.exe')
    : (process.env.SHELL || '/bin/zsh');
  return pty.spawn(shell, [], {
    name: 'xterm-256color',
    // Sized from the client's handshake instead of a fixed 80x24, so vim/top
    // don't flash a mis-sized screen on the first frame.
    cols,
    rows,
    cwd: os.homedir(),
    env: process.env,
  });
}

function clampDim(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(2, Math.min(Math.floor(v), 1000));
}

/** Keep the tail of the session's output so a reconnect can redraw the screen. */
function recordChunk(entry, data) {
  const chunk = Buffer.from(data, 'utf8');
  entry.buffer.push(chunk);
  entry.bufferBytes += chunk.length;
  // No `buffer.length > 1` floor: a single chunk larger than SCROLLBACK_BYTES
  // (e.g. `cat`-ing a big file in one onData callback) must still be
  // evictable, or the cap does nothing and that one burst stays buffered
  // (and gets replayed to every future reconnect) forever.
  while (entry.bufferBytes > SCROLLBACK_BYTES && entry.buffer.length > 0) {
    entry.bufferBytes -= entry.buffer.shift().length;
  }
  return chunk;
}

// Server -> client needs a side channel for things like tab titles, and raw pty
// output can contain anything, so the two are split by frame type: binary is
// terminal bytes, text is a JSON control message. Client -> server stays plain
// JSON exactly as before.
function broadcast(entry, chunk) {
  for (const ws of entry.viewers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
  }
}

function sendControl(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastControl(entry, obj) {
  for (const ws of entry.viewers) sendControl(ws, obj);
}

/** Size the pty to the smallest attached viewport. */
function syncSize(entry, { forceRepaint = false } = {}) {
  let cols = Infinity;
  let rows = Infinity;
  for (const ws of entry.viewers) {
    cols = Math.min(cols, ws.viewCols || 80);
    rows = Math.min(rows, ws.viewRows || 24);
  }
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
  entry.cols = cols;
  entry.rows = rows;
  try {
    if (forceRepaint) {
      // Nudging the size sends SIGWINCH twice, which makes full-screen programs
      // repaint instead of leaving the replayed snapshot on screen.
      entry.pty.resize(cols, Math.max(2, rows - 1));
      setTimeout(() => {
        try { entry.pty.resize(entry.cols, entry.rows); } catch {}
      }, 60);
    } else {
      entry.pty.resize(cols, rows);
    }
  } catch {}
}

function attachSocket(entry, ws, meta, isNewSession) {
  if (entry.killTimer) {
    clearTimeout(entry.killTimer);
    entry.killTimer = null;
  }

  ws.viewCols = meta.cols;
  ws.viewRows = meta.rows;
  ws.device = meta.device;
  ws.ip = meta.ip;
  ws.connectedAt = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  entry.viewers.add(ws);
  writeConnectMarker(entry.logStream, meta);

  // A reconnecting client — or a plain page reload, or a second device joining
  // — has an empty terminal but a very much alive shell. Hand it the recent
  // output so the screen matches reality.
  sendControl(ws, {
    type: 'hello',
    sid: entry.sid,
    resumed: entry.buffer.length > 0,
    // Distinct from `resumed` above: that one only asks "is there a buffer
    // worth replaying" (used to decide whether to reset the screen first),
    // and can be false for a session that's genuinely still alive but just
    // hasn't produced output yet. This one is unambiguous: true only when
    // the requested sid was already tracked in memory. If a client reconnects
    // after a drop and gets false here, the *server process* lost all
    // memory of it — i.e. it actually restarted, not just a network blip.
    existed: !isNewSession,
    title: entry.title,
    viewers: entry.viewers.size,
  });
  for (const chunk of entry.buffer) {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
  }
  syncSize(entry, { forceRepaint: true });

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
      ws.viewCols = clampDim(msg.cols, ws.viewCols);
      ws.viewRows = clampDim(msg.rows, ws.viewRows);
      syncSize(entry);
    } else if (msg.type === 'kill') {
      destroySession(entry);
    }
  });

  const detach = () => {
    if (!entry.viewers.delete(ws)) return;
    writeDisconnectMarker(entry.logStream);
    if (entry.viewers.size > 0) {
      // someone else is still watching — resize up to whoever remains
      syncSize(entry);
      return;
    }
    if (entry.killTimer) clearTimeout(entry.killTimer);
    entry.killTimer = setTimeout(() => {
      sessions.delete(entry.sid);
      try { entry.pty.kill(); } catch {}
    }, RECONNECT_GRACE_MS);
  };
  ws.on('close', detach);
  ws.on('error', detach);
}

function destroySession(entry) {
  if (entry.killTimer) clearTimeout(entry.killTimer);
  sessions.delete(entry.sid);
  try { entry.pty.kill(); } catch {}
}

function createSession(sid, cols, rows) {
  let ptyProcess;
  try {
    ptyProcess = spawnPty(cols, rows);
  } catch (err) {
    return { error: err };
  }

  const logStream = isLoggingEnabled() ? openLogStream(sid) : null;
  const entry = {
    sid,
    pty: ptyProcess,
    viewers: new Set(),
    killTimer: null,
    cols,
    rows,
    buffer: [],
    bufferBytes: 0,
    createdAt: Date.now(),
    title: '',
    logStream,
  };
  sessions.set(sid, entry);

  ptyProcess.onData((data) => {
    broadcast(entry, recordChunk(entry, data));
    writeChunk(entry.logStream, data);
  });
  ptyProcess.onExit(() => {
    if (entry.killTimer) clearTimeout(entry.killTimer);
    sessions.delete(sid);
    for (const ws of entry.viewers) {
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'shell exited');
    }
    entry.viewers.clear();
    if (entry.logStream) entry.logStream.end();
  });

  return { entry };
}

function handleUpgrade(req, socket, head, wss) {
  const url = new URL(req.url, 'http://localhost');

  const auth = checkAuth(req, url, { requireOrigin: true });
  if (!auth.ok) {
    socket.write(`HTTP/1.1 ${auth.status} Unauthorized\r\nConnection: close\r\n\r\n`);
    socket.destroy();
    return;
  }

  let sid = url.searchParams.get('sid');
  if (typeof sid !== 'string' || !sid) sid = crypto.randomUUID();

  const existing = sessions.get(sid);
  if (!existing && sessions.size >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const meta = {
    device: (url.searchParams.get('device') || '').slice(0, 40) || null,
    ip: req.socket.remoteAddress,
    cols: clampDim(url.searchParams.get('cols'), 80),
    rows: clampDim(url.searchParams.get('rows'), 24),
  };

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (existing) {
      attachSocket(existing, ws, meta, false);
      return;
    }
    const { entry, error } = createSession(sid, meta.cols, meta.rows);
    if (error) {
      ws.close(1011, 'failed to start shell');
      return;
    }
    attachSocket(entry, ws, meta, true);
  });
}

// One row per attached device, so the connections badge shows a laptop and a
// phone watching the same shell as two entries rather than one.
function listConnections() {
  const rows = [];
  for (const entry of sessions.values()) {
    for (const ws of entry.viewers) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      rows.push({
        device: ws.device,
        ip: ws.ip,
        connectedAt: ws.connectedAt,
        sid: entry.sid,
        shared: entry.viewers.size > 1,
      });
    }
  }
  return rows;
}

function listSessions() {
  return [...sessions.values()].map((entry) => ({
    sid: entry.sid,
    createdAt: entry.createdAt,
    viewers: entry.viewers.size,
    title: entry.title,
  }));
}

// Routers and mobile OSes silently drop idle sockets. Pinging keeps them honest
// and lets us reap half-open connections instead of hanging on to them.
function startHeartbeat(wss) {
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }, HEARTBEAT_MS);
  timer.unref();
  return timer;
}

// Foreground process name -> tab label, so tabs read "vim" / "top" instead of
// "webcli-1" / "webcli-2" until the user renames them by hand.
function startTitlePoll(onChange) {
  const timer = setInterval(() => {
    for (const entry of sessions.values()) {
      let title = '';
      try {
        title = entry.pty.process || '';
      } catch {}
      title = String(title).split(/[/\\]/).pop().slice(0, 24);
      if (title && title !== entry.title) {
        entry.title = title;
        broadcastControl(entry, { type: 'title', sid: entry.sid, title });
        if (onChange) onChange(entry);
      }
    }
  }, 2000);
  timer.unref();
  return timer;
}

function shutdownAll() {
  for (const entry of sessions.values()) {
    if (entry.killTimer) clearTimeout(entry.killTimer);
    if (entry.logStream) entry.logStream.end();
    try { entry.pty.kill(); } catch {}
  }
  sessions.clear();
}

module.exports = {
  handleUpgrade, shutdownAll, listConnections, listSessions, startHeartbeat, startTitlePoll,
};
