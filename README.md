# webcli

局域网网页终端：在浏览器里打开一个网页，就能看到并操作这台电脑上一个**完整、可交互**的终端（支持 vim / top / ssh 等全屏程序，跟本地开一个真终端窗口体验一致）。适合"在另一台电脑/手机上，临时操作一下这台机器"的场景。

- 后端：Node.js + [`node-pty`](https://github.com/microsoft/node-pty)（起真实 shell 进程）+ [`ws`](https://github.com/websockets/ws)（WebSocket）
- 前端：[`xterm.js`](https://xtermjs.org/)，无需安装，浏览器直接打开即可
- 鉴权：单一共享 token，放在访问链接里，同局域网内没有 token 连不上
- 每个浏览器标签页 = 一个独立的 shell 进程，互不共享，关闭标签页对应进程就会退出

## 快速开始

**前提**：装好 [Node.js](https://nodejs.org/)（建议 18 及以上版本）。

```bash
git clone https://github.com/zhaosay/webcli.git
cd webcli
```

**macOS**：双击 `start.command`（会自动弹出一个 Terminal 窗口跑起来），或者命令行执行：
```bash
./start.sh
```

**Windows**：双击 `start.bat`。

首次启动会自动 `npm install` 装依赖。启动成功后，终端里会打印出访问地址，形如：

```
[webcli] open: http://<你的电脑名>.local:3050/?token=xxxxxxxxxxxxxxxx
```

把这个完整链接（含 `?token=...`）复制给同一局域网内想要连接的另一台设备，用浏览器打开即可看到终端界面。页面顶部也有这个地址，带一键复制按钮。

默认端口 `3050`，可以用环境变量覆盖：`PROJECT_PORT=8080 ./start.sh`。

## 部署到别的电脑

同一局域网内每台想被远程操作的电脑，都各自 clone 一份、各自启动一个实例（谁的电脑跑这个服务，谁的终端就被暴露出来）：

```bash
gh repo clone zhaosay/webcli   # 私有仓库，需要该机器已登录有权限的 GitHub 账号
cd webcli
npm install
npm approve-scripts node-pty   # 如果 npm install 提示了这一步就跑一下（node-pty 是原生模块）
./start.sh
```

- Token 是**每台机器各自生成**的，存在代码目录上一级的 `../data/webcli/token.txt`，不会被 git 跟踪，也不会在多台机器间共用
- 想要开机自启/常驻后台，可以自己包一层 `nohup ./start.sh &`，或者写个系统级的自启动项

## 安全说明（请务必了解）

这是一个"局域网内部小工具"的信任模型，不是给公网用的：

- **没有 HTTPS**，token 和终端里的所有输入输出（包括你在里面敲的其他密码）在局域网内明文传输，能被同网段设备嗅探到
- 服务监听 `0.0.0.0`，不是只暴露给"局域网"——如果这台电脑同时开着 VPN、热点共享等，那些网络里也能连进来。本质上"拿到 token + 网络能通"就等于拿到一个 shell，请自行评估风险，不要把 token 到处发
- 没有账号体系、没有操作审计，谁有 token 谁就能在这台电脑上跑任意命令

## 已知问题

- `node-pty` 的 prebuilt 二进制解压后有时会丢失可执行位（`spawn-helper` 变成非可执行，报 `posix_spawnp failed`），`start.sh` 里已经加了 `chmod +x` 兜底，正常不需要手动处理
- 首次监听端口时 macOS 可能会弹出防火墙提示"是否允许接受网络连接"，需要点允许
