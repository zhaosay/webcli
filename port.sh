#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

DATA_DIR="../data/webcli"
PORT_FILE="$DATA_DIR/port.txt"
DEFAULT_PORT=3050

usage() {
  echo "用法: ./port.sh set <端口号> | status"
  echo "  set <端口号>  修改监听端口，需要重启服务才能生效"
  echo "  status        查看当前配置的端口"
  exit 1
}

current_port() {
  if [[ -n "${PROJECT_PORT:-}" ]]; then
    echo "$PROJECT_PORT"
  elif [[ -f "$PORT_FILE" ]]; then
    cat "$PORT_FILE"
  else
    echo "$DEFAULT_PORT"
  fi
}

mkdir -p "$DATA_DIR"

case "${1:-}" in
  set)
    PORT="${2:-}"
    if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
      echo "[webcli] 端口必须是 1-65535 之间的数字"
      exit 1
    fi
    printf '%s' "$PORT" > "$PORT_FILE"
    echo "[webcli] 端口已设置为 ${PORT}，重启服务后生效（面板选 1，或执行 ./restart.sh --bg）"
    ;;
  status)
    echo "[webcli] 当前配置端口: $(current_port)"
    if [[ -n "${PROJECT_PORT:-}" ]]; then
      echo "[webcli] 环境变量 PROJECT_PORT=$PROJECT_PORT 当前优先生效，覆盖了保存的端口"
    fi
    ;;
  *)
    usage
    ;;
esac
