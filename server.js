const http = require('http');
const os = require('os');
const WebSocket = require('ws');
const { PORT } = require('./lib/config');
const { TOKEN } = require('./lib/auth');
const { createRequestHandler } = require('./lib/routes');
const { handleUpgrade, shutdownAll } = require('./lib/pty-sessions');

const server = http.createServer(createRequestHandler());
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head, wss);
});

function shutdown() {
  shutdownAll();
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
