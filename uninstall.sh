#!/usr/bin/env bash
# 彻底卸载 webcli：停止服务、删掉开机自启/全局命令、删掉运行时数据、
# 最后删掉这个项目目录本身。不可撤销，需要输入 DELETE 确认。
#
# 退出码：0 = 已确认并删除完成；1 = 用户取消或校验失败（目录还在）。
set -uo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
DATA_DIR="../data/webcli"
DATA_DIR_DISPLAY="$(cd "$DATA_DIR" 2>/dev/null && pwd || echo "$PROJECT_DIR/../data/webcli")"
PLIST="$HOME/Library/LaunchAgents/com.webcli.server.plist"

echo "本操作会永久删除:"
echo "  - 项目代码目录: $PROJECT_DIR"
echo "  - 运行时数据目录: ${DATA_DIR_DISPLAY}（token、二次验证密钥、会话日志、自签名证书等）"

[ -f "$PLIST" ] && echo "  - 开机自启项: $PLIST"

# 只清理确认是指向这个项目的全局命令，不动同名但无关的文件
LINKS=""
for dir in /usr/local/bin /opt/homebrew/bin "$HOME/.local/bin" "$HOME/bin"; do
  link="$dir/webcli"
  if [ -L "$link" ]; then
    target="$(readlink "$link")"
    case "$target" in
      "$PROJECT_DIR"/*|"$PROJECT_DIR") LINKS="$LINKS $link" ;;
    esac
  fi
done
for l in $LINKS; do echo "  - 全局命令: $l"; done
echo

if git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  DIRTY="$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null)"
  if [ -n "$DIRTY" ]; then
    echo "警告: 项目目录里有还没提交/推送的改动，删除后无法恢复:"
    echo "$DIRTY" | sed 's/^/  /'
    echo
  fi
fi

echo "这个操作不可撤销。确认删除请输入大写 DELETE，其他任意输入取消:"
read -r CONFIRM
if [ "$CONFIRM" != "DELETE" ]; then
  echo "[webcli] 已取消，什么都没有删除"
  exit 1
fi

./restart.sh stop 2>/dev/null || true

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "[webcli] 已移除开机自启项"
fi

for l in $LINKS; do
  rm -f "$l" && echo "[webcli] 已移除全局命令: $l"
done

rm -rf "$DATA_DIR_DISPLAY"
echo "[webcli] 已删除数据目录"

# 删除项目目录本身，包括这个脚本自己——在 POSIX 系统上这是安全的：内核会保留
# 已打开文件的数据块直到所有引用它的文件描述符关闭，所以正在读取/执行这个脚本
# 的 shell 不会因为文件被 unlink 而中断，会正常执行完这几行剩余代码。
cd "$PROJECT_DIR/.."
rm -rf "$PROJECT_DIR"
echo "[webcli] 已删除项目目录，webcli 卸载完成"
