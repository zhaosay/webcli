const fs = require('fs');
const path = require('path');
const { MAX_NAME_LENGTH } = require('./config');
const { tokenMatches, isAuthEnabled, secondaryKeyMatches, loadName, saveName } = require('./auth');
const { VERSION_INFO } = require('./version');
const { listConnections } = require('./pty-sessions');

const STATIC_FILES = {
  '/': { file: path.join(__dirname, '..', 'public', 'index.html'), type: 'text/html' },
  '/index.html': { file: path.join(__dirname, '..', 'public', 'index.html'), type: 'text/html' },
  '/vendor/xterm.js': { file: require.resolve('@xterm/xterm/lib/xterm.js'), type: 'application/javascript' },
  '/vendor/xterm.css': { file: require.resolve('@xterm/xterm/css/xterm.css'), type: 'text/css' },
  '/vendor/addon-fit.js': { file: require.resolve('@xterm/addon-fit/lib/addon-fit.js'), type: 'application/javascript' },
  '/vendor/addon-search.js': { file: require.resolve('@xterm/addon-search/lib/addon-search.js'), type: 'application/javascript' },
};

function handleName(req, res, parsedUrl) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: loadName() }));
    return;
  }

  if (!tokenMatches(parsedUrl.searchParams.get('token'))) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid token' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024) req.destroy();
  });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid json' }));
      return;
    }
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'name required' }));
      return;
    }
    saveName(name);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name }));
  });
}

function createRequestHandler() {
  return (req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/auth-status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ enabled: isAuthEnabled() }));
      return;
    }

    if (pathname === '/api/version' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(VERSION_INFO));
      return;
    }

    if (pathname === '/api/name' && (req.method === 'GET' || req.method === 'POST')) {
      handleName(req, res, parsedUrl);
      return;
    }

    if (pathname === '/api/connections' && req.method === 'GET') {
      if (!tokenMatches(parsedUrl.searchParams.get('token'))
        || (isAuthEnabled() && !secondaryKeyMatches(parsedUrl.searchParams.get('key')))) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid token' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ connections: listConnections() }));
      return;
    }

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
  };
}

module.exports = { createRequestHandler };
