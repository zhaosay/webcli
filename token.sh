#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

DATA_DIR="../data/webcli"
TOKEN_FILE="$DATA_DIR/token.txt"

usage() {
  echo "用法: ./token.sh regen | status"
  echo "  regen   生成新 token 并重启服务使其立即生效（会踢掉所有当前连接）"
  echo "  status  查看当前 token"
  exit 1
}

mkdir -p "$DATA_DIR"

case "${1:-}" in
  regen)
    NEW_TOKEN="$(openssl rand -hex 16 2>/dev/null || node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
    printf '%s' "$NEW_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "[webcli] 新 token 已生成，重启服务使其生效（旧链接会全部失效，所有当前连接会被断开）..."
    exec ./restart.sh
    ;;
  status)
    if [[ -f "$TOKEN_FILE" ]]; then
      echo "[webcli] 当前 token: $(cat "$TOKEN_FILE")"
    else
      echo "[webcli] 还没有 token（先启动一次服务会自动生成）"
    fi
    ;;
  *)
    usage
    ;;
esac
