#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

DATA_DIR="../data/webcli"
FLAG_FILE="$DATA_DIR/auth-enabled"
KEY_FILE="$DATA_DIR/secondary-key.txt"

usage() {
  echo "用法: ./auth.sh on | off | status"
  echo "  on      开启二次验证（每次都会生成一把新密钥）"
  echo "  off     关闭二次验证"
  echo "  status  查看当前状态"
  exit 1
}

mkdir -p "$DATA_DIR"

case "${1:-}" in
  on)
    KEY="$(openssl rand -hex 8 2>/dev/null || node -e "console.log(require('crypto').randomBytes(8).toString('hex'))")"
    printf '%s' "$KEY" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    printf '1' > "$FLAG_FILE"
    echo "[webcli] 二次验证已开启，无需重启服务即可生效"
    echo "[webcli] 新密钥: $KEY"
    echo "[webcli] 把这把密钥单独发给需要连接的人（不要和访问链接放在一起）"
    ;;
  off)
    printf '0' > "$FLAG_FILE"
    rm -f "$KEY_FILE"
    echo "[webcli] 二次验证已关闭，无需重启服务即可生效"
    ;;
  status)
    if [[ -f "$FLAG_FILE" && "$(cat "$FLAG_FILE")" == "1" ]]; then
      echo "[webcli] 当前状态: 已开启"
      [[ -f "$KEY_FILE" ]] && echo "[webcli] 当前密钥: $(cat "$KEY_FILE")"
    else
      echo "[webcli] 当前状态: 已关闭"
    fi
    ;;
  *)
    usage
    ;;
esac
