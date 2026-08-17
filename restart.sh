#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PID_FILE="../data/webcli/server.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[webcli] stopping running instance (pid $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    for _ in $(seq 1 25); do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.2
    done
    kill -0 "$OLD_PID" 2>/dev/null && kill -9 "$OLD_PID" 2>/dev/null || true
  fi
fi

exec ./start.sh
