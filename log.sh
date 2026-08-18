#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

DATA_DIR="../data/webcli"
FLAG_FILE="$DATA_DIR/log-enabled"
LOGS_DIR="$DATA_DIR/logs"
RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"

usage() {
  echo "用法: ./log.sh on | off | status | list"
  echo "  on      开启会话记录（只记屏幕输出，不记按键），实时生效不需要重启"
  echo "  off     关闭会话记录"
  echo "  status  查看当前状态、日志数量和占用空间"
  echo "  list    按时间列出所有日志文件"
  exit 1
}

mkdir -p "$DATA_DIR"

case "${1:-}" in
  on)
    printf '1' > "$FLAG_FILE"
    echo "[webcli] 会话记录已开启，无需重启服务即可生效（只影响新建立的连接，已经连着的不受影响）"
    echo "[webcli] 从现在起，新连接的屏幕输出会被记录到 $LOGS_DIR/，保留 $RETENTION_DAYS 天后自动清理"
    echo "[webcli] 注意：终端里 cat/查看的任何敏感内容都会原样进日志，请把这个目录当敏感文件对待"
    ;;
  off)
    printf '0' > "$FLAG_FILE"
    echo "[webcli] 会话记录已关闭，无需重启服务即可生效"
    ;;
  status)
    if [[ -f "$FLAG_FILE" && "$(cat "$FLAG_FILE")" == "1" ]]; then
      echo "[webcli] 当前状态: 已开启（保留 $RETENTION_DAYS 天）"
    else
      echo "[webcli] 当前状态: 已关闭"
    fi
    if [[ -d "$LOGS_DIR" ]]; then
      COUNT="$(find "$LOGS_DIR" -type f -name '*.log' | wc -l | tr -d ' ')"
      SIZE="$(du -sh "$LOGS_DIR" 2>/dev/null | cut -f1)"
      echo "[webcli] 当前日志: $COUNT 个文件，共 $SIZE"
    else
      echo "[webcli] 当前日志: 0 个文件"
    fi
    ;;
  list)
    if [[ -d "$LOGS_DIR" ]]; then
      ls -lt "$LOGS_DIR"
    else
      echo "[webcli] 还没有日志文件"
    fi
    ;;
  *)
    usage
    ;;
esac
