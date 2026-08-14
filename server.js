const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const WebSocket = require('ws');
const pty = require('node-pty');

const PORT = process.env.PROJECT_PORT || 3050;
const DATA_DIR = path.join(__dirname, '..', 'data', 'webcli');
const TOKEN_FILE = path.join(DATA_DIR, 'token.txt');
const MAX_SESSIONS = 10;

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

function tokenMatches(candidate) {
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const STATIC_FILES = {
  '/': { file: path.join(__dirname, 'public', 'index.html'), type: 'text/html' },
  '/index.html': { file: path.join(__dirname, 'public', 'index.html'), type: 'text/html' },
  '/vendor/xterm.js': { file: require.resolve('@xterm/xterm/lib/xterm.js'), type: 'application/javascript' },
  '/vendor/xterm.css': { file: require.resolve('@xterm/xterm/css/xterm.css'), type: 'text/css' },
  '/vendor/addon-fit.js': { file: require.resolve('@xterm/addon-fit/lib/addon-fit.js'), type: 'application/javascript' },
};

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  const entry = STATIC_FILES[pathname];
  if (!entry) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  fs.readFile(entry.file, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Failed to read file');
      return;
    }
    res.writeHead(200, { 'Content-Type': entry.type });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ noServer: true });
const livePtys = new Set();

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const candidate = url.searchParams.get('token');

  if (!tokenMatches(candidate)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (livePtys.size >= MAX_SESSIONS) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const shell = process.env.SHELL || '/bin/zsh';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env,
  });

  livePtys.add(ptyProcess);

  ptyProcess.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  ptyProcess.onExit(() => {
    livePtys.delete(ptyProcess);
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'shell exited');
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'input' && typeof msg.data === 'string') {
      ptyProcess.write(msg.data);
    } else if (msg.type === 'resize' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
      ptyProcess.resize(msg.cols, msg.rows);
    }
  });

  const cleanup = () => {
    livePtys.delete(ptyProcess);
    ptyProcess.kill();
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

function shutdown() {
  for (const p of livePtys) {
    try { p.kill(); } catch {}
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  const hostname = os.hostname();
  const mdnsHost = hostname.endsWith('.local') ? hostname : `${hostname}.local`;
  console.log(`[webcli] listening on 0.0.0.0:${PORT}`);
  console.log(`[webcli] open: http://${mdnsHost}:${PORT}/?token=${TOKEN}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`[webcli] fallback: http://${net.address}:${PORT}/?token=${TOKEN}`);
      }
    }
  }
});
