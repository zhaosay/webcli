#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# If a previous webcli instance is still holding the port (crashed shell,
# stale process, etc.), clear it before binding again instead of dying with
# EADDRINUSE. restart.sh's stop_server only ever kills a process it can
# confirm is our own server.js — never a stranger that merely holds the port.
if [ -x ./restart.sh ]; then
  ./restart.sh stop quiet || true
fi

if [ ! -d node_modules ]; then
  echo "[webcli] node_modules not found, running npm install..."
  npm install
fi

# node-pty's prebuilt spawn-helper binary can lose its executable bit during
# extraction; without +x, spawning a shell fails with "posix_spawnp failed".
# Search the whole package rather than hardcoding a subdirectory: the exact
# prebuild layout has changed across node-pty versions before (this used to
# also live under a since-removed build/ path).
if [ -d node_modules/node-pty ]; then
  helpers="$(find node_modules/node-pty -type f -name spawn-helper 2>/dev/null)"
  if [ -n "$helpers" ]; then
    echo "$helpers" | xargs chmod +x 2>/dev/null || true
  else
    echo "[webcli] warning: no node-pty spawn-helper binary found to chmod +x (layout may have changed)"
  fi
fi

exec node server.js
