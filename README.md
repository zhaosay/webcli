# webcli

局域网网页终端：在浏览器里打开一个网页，就能看到并操作这台电脑上一个**完整、可交互**的终端（支持 vim / top / ssh 等全屏程序，跟本地开一个真终端窗口体验一致）。适合"在另一台电脑/手机上，临时操作一下这台机器"的场景。

- 后端：Node.js + [`node-pty`](https://github.com/microsoft/node-pty)（起真实 shell 进程）+ [`ws`](https://github.com/websockets/ws)（WebSocket）
- 前端：[`xterm.js`](https://xtermjs.org/)，无需安装，浏览器直接打开即可
- 鉴权：单一共享 token，放在访问链接里，同局域网内没有 token 连不上；可选再加一道独立的二次验证密钥（见下）
- 页面内自带 tab 栏，一个浏览器窗口就能开多个终端（点 `+` 新建、点 `×` 关闭），每个 tab 对应一个独立的 shell 进程，互不共享
- 页面顶部的名字（默认是电脑的 hostname）点一下就能改，方便同时开着好几台电脑的页面时分清楚哪个 tab 是哪台机器
- 网络短暂中断（wifi 抖动、笔记本合盖、手机锁屏）会自动重连，30 秒内恢复的话正在跑的命令不会丢（可用 `RECONNECT_GRACE_MS` 环境变量调整这个宽限期）；超过宽限期或手动关闭 tab 才会真正结束该终端
- 终端里按 `Ctrl/Cmd+F` 能搜索当前回滚内容；窄屏（手机）下会出现一排 Esc / Tab / Ctrl+C / Ctrl+D / 方向键按钮，方便触屏输入

## 安装（被控端：这台电脑要被远程操作）

同一局域网内，**每台**想被远程操作的电脑都要各自装一份、各自起一个实例——谁的电脑跑这个服务，谁的终端就被暴露出来，不存在"装一次，所有电脑共用"。

**前提**：装好 [Node.js](https://nodejs.org/)（建议 18 及以上版本）。

1. 克隆代码：
   ```bash
   git clone https://github.com/zhaosay/webcli.git
   # 私有仓库、且该电脑已登录有权限的 GitHub 账号，也可以用：
   # gh repo clone zhaosay/webcli
   cd webcli
   ```
2. 启动：
   - **macOS**：双击 `start.command`，或命令行 `./start.sh`
   - **Windows**：双击 `start.bat`
   
   首次启动会自动 `npm install` 装依赖（`node-pty` 是原生模块，如果提示要跑 `npm approve-scripts node-pty`，跑一下就行）。
3. 启动成功后，终端里会打印访问地址：
   ```
   [webcli] open: http://<这台电脑名>.local:3050/?token=xxxxxxxxxxxxxxxx
   ```
   这就是别人要用来连接这台电脑的完整链接。

- Token 每台电脑各自生成一份，存在代码目录上一级的 `../data/webcli/token.txt`，不进 git、不跨机器共用；只要不删这个文件，重启服务链接不变
- 默认端口 `3050`，可用环境变量覆盖：`PROJECT_PORT=8080 ./start.sh`
- 想开机自启/常驻，自己包一层 `nohup ./start.sh &`，或写个系统级自启动项

## 更新（被控端）

代码有更新时，在项目目录里跑（或 macOS 双击 `update.command` / Windows 双击 `update.bat`）：

```bash
./update.sh
```

自动 `git pull`（只做 fast-forward，有本地冲突会直接报错，不会帮你丢改动；`package-lock.json` 是各机器 `npm install` 自动生成的文件，脚本会先丢弃它的本地改动再拉取，不会因为这个卡住），`package.json`/`package-lock.json` 有变化会顺便 `npm install`，**装完会自动杀掉旧进程、重启服务**，不需要再手动操作——同一个终端窗口会从"更新日志"无缝切到"服务运行日志"。杀旧进程不会丢 token/配置，重开后访问链接不变。

如果自动重启没生效（比如旧版本没有这个功能、进程识别不到），再手动来一下：

- **macOS**：`lsof -ti:3050 | xargs kill && ./start.sh`
- **Windows**：`netstat -ano | findstr :3050` 查 PID，`taskkill /PID <PID> /F`，再 `start.bat`

多台电脑各自更新，版本容易不一致——启动时终端会打印 `[webcli] version: v0.2.0 (b531cb2)`，页面顶部（电脑名旁边）也有同样的小字，鼠标悬停能看到提交时间，用来确认这台机器到底跑的是哪个版本。

## 打开（客户端：在别的设备上访问）

想临时操作某台电脑的人，**不需要装任何东西**：

1. 确认自己的设备（电脑/手机）和目标电脑在同一局域网
2. 拿到目标电脑给的访问链接（形如 `http://xxx.local:3050/?token=xxx`，见上面"安装"步骤 3 或下面"分享"）
3. 浏览器直接打开这个链接，即可看到并操作终端

页面内自带 tab 栏，点 `+` 可以再开一个终端（各 tab 是独立 shell 进程）；页面顶部名字（默认是电脑 hostname）点一下能改，方便同时开多台电脑时区分。

## 分享（把访问链接发给别人）

- 被控端启动时终端打印的 `open:` 那行，就是完整访问链接，直接复制发给对方
- 或者：被控端自己先用浏览器打开这个链接，页面顶部地址栏旁边有个 **Copy** 按钮，点一下把当前网址复制到剪贴板，再转发给要连接的人
- 链接里带 token，泄露给谁、就是把这台电脑的 shell 权限给了谁——不要发到公开/大群里（更多风险见下面"安全说明"）

## 二次验证（可选，默认关闭）

访问链接里的 token 一旦泄露（比如浏览器历史记录、截图、分享到群里），任何人都能连进来。如果需要多一道独立防护，可以开启二次验证——除了 URL 里的 token，还需要**单独输入**一把密钥（不放在 URL 里，不容易跟链接一起泄露）：

```bash
./auth.sh on       # 开启，每次都会生成一把新密钥
./auth.sh off      # 关闭
./auth.sh status   # 查看当前状态/密钥
```

开关**立即生效，不需要重启服务**（不会打断正在跑的终端）。开启后浏览器打开链接会多弹一个"输入二次验证密钥"的框，输入一次后这个浏览器标签页会记住（`sessionStorage`，关闭标签页就清掉），不用每个新 tab 都重复输入。密钥请单独发给需要连接的人，不要和访问链接放在一起分享。

## 开机自启（可选）

**macOS**：用 `contrib/com.webcli.server.plist` 模板——按文件里的注释把两处路径占位符替换成实际路径，放到 `~/Library/LaunchAgents/`，然后：
```bash
launchctl load ~/Library/LaunchAgents/com.webcli.server.plist    # 启用
launchctl unload ~/Library/LaunchAgents/com.webcli.server.plist  # 禁用
```

**Windows**：用系统自带的任务计划，登录时自动跑 `start.bat`（把路径换成实际项目路径）：
```cmd
schtasks /create /tn "webcli" /tr "C:\path\to\webcli\start.bat" /sc onlogon
schtasks /delete /tn "webcli" /f   REM 取消
```

## 安全说明（请务必了解）

这是一个"局域网内部小工具"的信任模型，不是给公网用的：

- **没有 HTTPS**，token 和终端里的所有输入输出（包括你在里面敲的其他密码）在局域网内明文传输，能被同网段设备嗅探到
- 服务监听 `0.0.0.0`，不是只暴露给"局域网"——如果这台电脑同时开着 VPN、热点共享等，那些网络里也能连进来。本质上"拿到 token + 网络能通"就等于拿到一个 shell，请自行评估风险，不要把 token 到处发
- 没有账号体系、没有操作审计，谁有 token 谁就能在这台电脑上跑任意命令

## 已知问题

- `node-pty` 的 prebuilt 二进制解压后有时会丢失可执行位（`spawn-helper` 变成非可执行，报 `posix_spawnp failed`），`start.sh` 里已经加了 `chmod +x` 兜底，正常不需要手动处理
- 首次监听端口时 macOS 可能会弹出防火墙提示"是否允许接受网络连接"，需要点允许
