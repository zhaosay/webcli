#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "[webcli] pulling latest changes..."
git pull --ff-only

if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE '^package(-lock)?\.json$'; then
  echo "[webcli] package.json changed, running npm install..."
  npm install
fi

echo "[webcli] update complete. Restart the server to apply changes:"
echo "  - workspace Launcher.command: 选 webcli -> [k]停止 -> [s]启动"
echo "  - standalone: 重新跑 ./start.sh，或双击 start.command / start.bat"
