const http = require('http');
const os = require('os');
const fs = require('fs');
const WebSocket = require('ws');
const { PORT, DATA_DIR, PID_FILE } = require('./lib/config');
const { TOKEN } = require('./lib/auth');
const { createRequestHandler } = require('./lib/routes');
const { handleUpgrade, shutdownAll } = require('./lib/pty-sessions');
const { VERSION_INFO } = require('./lib/version');

const server = http.createServer(createRequestHandler());
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head, wss);
});

function shutdown() {
  shutdownAll();
  try { fs.unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
  const hostname = os.hostname();
  const mdnsHost = hostname.endsWith('.local') ? hostname : `${hostname}.local`;
  const commitLabel = VERSION_INFO.commit ? ` (${VERSION_INFO.commit})` : '';
  console.log(`[webcli] version: v${VERSION_INFO.version}${commitLabel}`);
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
