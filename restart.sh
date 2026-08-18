#!/usr/bin/env bash
# 默认行为（无参数）：停掉旧实例，然后在前台启动 —— update.sh 依赖这个语义，
# 更新日志能无缝切到服务日志。
#
#   ./restart.sh          停旧的，前台启动
#   ./restart.sh --bg     停旧的，后台启动并打印访问链接/二维码
#   ./restart.sh stop     只停
#   ./restart.sh status   看状态
set -uo pipefail
cd "$(dirname "$0")"

DIR="$(pwd)"
PID_FILE="../data/webcli/server.pid"
LOG_FILE=".run/run.log"
PORT="${PROJECT_PORT:-3050}"

say() { echo "[webcli] $*"; }

# The pid file is written by the server process itself, so it is the source of
# truth — but it goes stale on a hard kill, and only a process whose command
# line is actually our server.js may be signalled. Never kill a stranger that
# merely happens to hold the port.
is_ours() {
  ps -p "$1" -o command= 2>/dev/null | grep -q "server\.js"
}

find_pid() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && is_ours "$pid"; then
      echo "$pid"; return 0
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    local p
    for p in $(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null); do
      is_ours "$p" && { echo "$p"; return 0; }
    done
  fi

  return 1
}

stop_server() {
  local pid
  if ! pid="$(find_pid)"; then
    [ "${1:-}" = quiet ] || say "没有在跑的实例"
    rm -f "$PID_FILE"
    return 0
  fi
  say "stopping running instance (pid $pid)..."
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 25); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  if kill -0 "$pid" 2>/dev/null; then
    say "没退干净，强制结束"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.3
  fi
  rm -f "$PID_FILE"
}

status_server() {
  local pid
  if pid="$(find_pid)"; then
    say "运行中，pid $pid，端口 $PORT"
    grep -m1 "open:" "$LOG_FILE" 2>/dev/null
    return 0
  fi
  say "未运行"
  return 1
}

start_background() {
  mkdir -p .run
  : > "$LOG_FILE"
  say "启动中..."
  nohup ./start.sh >> "$LOG_FILE" 2>&1 &
  local shell_pid=$!

  for _ in $(seq 1 240); do
    if grep -q "listening on" "$LOG_FILE" 2>/dev/null; then
      echo
      sed -n '/listening on/,$p' "$LOG_FILE"
      echo
      say "日志: tail -f $LOG_FILE"
      return 0
    fi
    if ! kill -0 "$shell_pid" 2>/dev/null; then
      if grep -q "EADDRINUSE" "$LOG_FILE" 2>/dev/null; then
        say "端口 $PORT 被别的程序占用（不是 webcli，所以没有动它）"
        say "换个端口: PROJECT_PORT=3060 ./restart.sh --bg"
        command -v lsof >/dev/null 2>&1 && lsof -i "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | head -3
      else
        say "启动失败，日志如下:"
        echo "-----"; tail -20 "$LOG_FILE"; echo "-----"
      fi
      return 1
    fi
    sleep 0.5
  done
  say "等了 120 秒还没就绪，看看 $LOG_FILE"
  return 1
}

case "${1:-}" in
  stop)   stop_server ;;
  status) status_server ;;
  --bg|-b) stop_server quiet; start_background ;;
  -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    stop_server quiet
    exec ./start.sh
    ;;
esac
