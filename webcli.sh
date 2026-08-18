#!/usr/bin/env bash
# webcli 控制面板：选数字就能启动 / 停止 / 更新 / 看二维码。
# 只是把已有的 restart.sh / update.sh / auth.sh / token.sh / log.sh 包一层，
# 不重复实现任何逻辑。
set -uo pipefail

# Resolve symlinks so an installed `webcli` on PATH still finds the project dir.
# (macOS ships a readlink without -f, hence the manual walk.)
SELF="$0"
while [ -L "$SELF" ]; do
  LINK="$(readlink "$SELF")"
  case "$LINK" in
    /*) SELF="$LINK" ;;
    *)  SELF="$(dirname "$SELF")/$LINK" ;;
  esac
done
cd "$(dirname "$SELF")"

PORT="${PROJECT_PORT:-3050}"
LOG_FILE=".run/run.log"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'
YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'

pause() { echo; read -r -p "${DIM}回车返回菜单${RESET} " _; }
running() { ./restart.sh status >/dev/null 2>&1; }
flag_on() { [ -f "../data/webcli/$1" ] && [ "$(cat "../data/webcli/$1" 2>/dev/null)" = "1" ]; }

header() {
  clear 2>/dev/null || true
  echo "${BOLD}  webcli 控制面板${RESET}"
  echo "  ${DIM}$(pwd)${RESET}"
  echo
  if running; then
    echo "  状态   ${GREEN}● 运行中${RESET} ${DIM}(端口 $PORT)${RESET}"
    local link
    link="$(grep -m1 'open:' "$LOG_FILE" 2>/dev/null | sed 's/.*open: //')"
    [ -n "$link" ] && echo "  链接   ${CYAN}$link${RESET}"
  else
    echo "  状态   ${RED}○ 未运行${RESET}"
  fi
  echo -n "  二次验证 "; flag_on auth-enabled && echo -n "${GREEN}开${RESET}" || echo -n "${DIM}关${RESET}"
  echo -n "   会话记录 "; flag_on log-enabled && echo "${GREEN}开${RESET}" || echo "${DIM}关${RESET}"
  echo
  echo "  ${BOLD}1${RESET}  启动 / 重启"
  echo "  ${BOLD}2${RESET}  停止"
  echo "  ${BOLD}3${RESET}  更新代码并重启"
  echo "  ${BOLD}4${RESET}  显示访问链接和二维码"
  echo
  echo "  ${DIM}5  二次验证开关     6  重新生成 token${RESET}"
  echo "  ${DIM}7  会话记录开关     8  查看日志${RESET}"
  echo "  ${DIM}9  安装全局 webcli 命令${RESET}"
  echo "  ${DIM}0  退出${RESET}"
  echo
}

do_restart() { echo; ./restart.sh --bg; pause; }
do_stop()    { echo; ./restart.sh stop; pause; }

do_update() {
  echo
  # update.sh ends with `exec ./restart.sh`, which would take over this shell in
  # the foreground — run it in a subshell that restarts in the background instead.
  if ! git pull --ff-only 2>&1; then
    echo
    echo "${RED}[webcli] 更新失败${RESET}（本地有改动挡住了 git pull，先 git stash 或 git checkout .）"
    pause
    return
  fi
  if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -qE '^package(-lock)?\.json$'; then
    echo "[webcli] 依赖有变化，npm install..."
    npm install
  fi
  echo
  ./restart.sh --bg
  pause
}

do_link() {
  echo
  if ! running; then
    echo "${YELLOW}[webcli] 服务没在跑，先选 1 启动${RESET}"
    pause
    return
  fi
  sed -n '/listening on/,$p' "$LOG_FILE" 2>/dev/null | head -40
  echo
  echo "${DIM}手机扫上面的二维码即可连接；链接含 token，不要公开分享。${RESET}"
  pause
}

do_auth() {
  echo
  if flag_on auth-enabled; then
    read -r -p "二次验证当前是【开】，要关掉吗？[y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] && ./auth.sh off
  else
    read -r -p "二次验证当前是【关】，要开启吗？会生成一把新密钥 [y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] && ./auth.sh on
  fi
  echo
  echo "${DIM}立即生效，不需要重启，正在跑的终端不受影响。${RESET}"
  pause
}

do_token() {
  echo
  ./token.sh status
  echo
  read -r -p "${YELLOW}重新生成会立刻断开所有已连接设备、旧链接全部失效${RESET}，继续？[y/N] " yn
  [[ "$yn" =~ ^[Yy]$ ]] && ./token.sh regen
  pause
}

do_log() {
  echo
  ./log.sh status
  echo
  if flag_on log-enabled; then
    read -r -p "会话记录当前是【开】，要关掉吗？[y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] && ./log.sh off
  else
    read -r -p "会话记录当前是【关】，要开启吗？[y/N] " yn
    [[ "$yn" =~ ^[Yy]$ ]] && ./log.sh on
  fi
  pause
}

do_logs() {
  echo
  echo "${DIM}Ctrl-C 停止跟踪${RESET}"
  echo
  tail -f "$LOG_FILE" 2>/dev/null || echo "还没有日志"
  pause
}

do_install_cli() {
  local src target dir
  src="$(pwd)/webcli.sh"
  for dir in /usr/local/bin /opt/homebrew/bin "$HOME/.local/bin" "$HOME/bin"; do
    if [ -d "$dir" ] && [ -w "$dir" ]; then target="$dir/webcli"; break; fi
  done
  if [ -z "${target:-}" ]; then
    mkdir -p "$HOME/.local/bin" 2>/dev/null && target="$HOME/.local/bin/webcli"
  fi
  if [ -z "${target:-}" ]; then
    echo "${RED}[webcli] 找不到可写目录${RESET}，手动加个别名:"
    echo "  echo \"alias webcli='$src'\" >> ~/.zshrc && source ~/.zshrc"
    return 1
  fi
  ln -sf "$src" "$target"
  chmod +x "$src"
  echo "${GREEN}[webcli] 已安装:${RESET} $target"
  case ":$PATH:" in
    *":$(dirname "$target"):"*)
      echo "现在任何目录敲 ${BOLD}webcli${RESET} 都能呼出面板，${BOLD}webcli 3${RESET} 直接更新重启" ;;
    *)
      local rc="$HOME/.zshrc"
      [[ "${SHELL:-}" == *bash* ]] && rc="$HOME/.bash_profile"
      echo "${YELLOW}注意${RESET} $(dirname "$target") 不在 PATH 上，跑一下:"
      echo "  echo 'export PATH=\"$(dirname "$target"):\$PATH\"' >> $rc && source $rc" ;;
  esac
}

if [ $# -gt 0 ]; then
  case "$1" in
    1|restart) ./restart.sh --bg; exit $? ;;
    2|stop)    ./restart.sh stop; exit $? ;;
    3|update)  do_update; exit 0 ;;
    4|link)    do_link; exit 0 ;;
    install)   do_install_cli; exit $? ;;
    -h|--help)
      echo "用法: webcli [1|2|3|4|install]"
      echo "  不带参数进交互菜单；1 重启 / 2 停止 / 3 更新重启 / 4 显示二维码"
      exit 0 ;;
  esac
fi

while true; do
  header
  read -r -p "  选择: " choice
  case "$choice" in
    1) do_restart ;;
    2) do_stop ;;
    3) do_update ;;
    4) do_link ;;
    5) do_auth ;;
    6) do_token ;;
    7) do_log ;;
    8) do_logs ;;
    9) echo; do_install_cli; pause ;;
    0|q|Q) echo; exit 0 ;;
    *) ;;
  esac
done
