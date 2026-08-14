#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[lan-terminal] node_modules not found, running npm install..."
  npm install
fi

# node-pty's prebuilt spawn-helper binary can lose its executable bit during
# extraction; without +x, spawning a shell fails with "posix_spawnp failed".
find node_modules/node-pty/prebuilds node_modules/node-pty/build \
  -name spawn-helper -exec chmod +x {} \; 2>/dev/null || true

exec node server.js
