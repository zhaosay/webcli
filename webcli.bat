@echo off
REM webcli 控制面板 (Windows)：选数字就能启动 / 停止 / 更新 / 看二维码。
REM 只是把已有的 restart.bat / update.bat / auth.bat / token.bat / log.bat / uninstall.bat
REM 包一层，不重复实现任何逻辑 —— 对齐 webcli.sh 的菜单结构。
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%PROJECT_PORT%"=="" (set "PORT=3050") else (set "PORT=%PROJECT_PORT%")
set "LOG_FILE=.run\run.log"
set "DATA_DIR=..\data\webcli"

if "%~1"=="" goto menu
if "%~1"=="1" goto arg_restart
if /I "%~1"=="restart" goto arg_restart
if "%~1"=="2" goto arg_stop
if /I "%~1"=="stop" goto arg_stop
if "%~1"=="3" goto arg_update
if /I "%~1"=="update" goto arg_update
if "%~1"=="4" goto arg_link
if /I "%~1"=="link" goto arg_link
if /I "%~1"=="install" goto arg_install
if /I "%~1"=="uninstall" goto arg_uninstall
goto help

:arg_restart
call restart.bat --bg
exit /b %errorlevel%

:arg_stop
call restart.bat stop
exit /b %errorlevel%

:arg_update
call :do_update
exit /b 0

:arg_link
call :do_link
exit /b 0

:arg_install
call :do_install_cli
exit /b 0

:arg_uninstall
call :do_uninstall
exit /b 0

:help
echo 用法: webcli [1^|2^|3^|4^|install^|uninstall]
echo   不带参数进交互菜单；1 重启 / 2 停止 / 3 更新重启 / 4 显示二维码
exit /b 0

:menu
call :header
set "CHOICE="
set /p "CHOICE=  选择: "
if "%CHOICE%"=="1" call :do_restart
if "%CHOICE%"=="2" call :do_stop
if "%CHOICE%"=="3" call :do_update
if "%CHOICE%"=="4" call :do_link
if "%CHOICE%"=="5" call :do_auth
if "%CHOICE%"=="6" call :do_token
if "%CHOICE%"=="7" call :do_log
if "%CHOICE%"=="8" call :do_logs
if "%CHOICE%"=="9" call :do_install_cli
if /I "%CHOICE%"=="u" (call :do_uninstall & goto :eof)
if "%CHOICE%"=="0" goto :eof
if /I "%CHOICE%"=="q" goto :eof
goto menu

:header
cls
echo   webcli 控制面板
echo   %CD%
echo.
call restart.bat status >nul 2>&1
if not errorlevel 1 (
  echo   状态   [运行中] (端口 %PORT%)
  for /f "tokens=1,* delims=:" %%A in ('findstr /C:"open:" "%LOG_FILE%" 2^>nul') do echo   链接   %%B
) else (
  echo   状态   [未运行]
)
set "AUTH_STATE=关"
if exist "%DATA_DIR%\auth-enabled" (
  set "AUTHFLAG="
  set /p AUTHFLAG=<"%DATA_DIR%\auth-enabled"
  if "!AUTHFLAG!"=="1" set "AUTH_STATE=开"
)
set "LOG_STATE=关"
if exist "%DATA_DIR%\log-enabled" (
  set "LOGFLAG="
  set /p LOGFLAG=<"%DATA_DIR%\log-enabled"
  if "!LOGFLAG!"=="1" set "LOG_STATE=开"
)
echo   二次验证 !AUTH_STATE!     会话记录 !LOG_STATE!
echo.
echo   1  启动 / 重启
echo   2  停止
echo   3  更新代码并重启
echo   4  显示访问链接和二维码
echo.
echo   5  二次验证开关     6  重新生成 token
echo   7  会话记录开关     8  查看日志
echo   9  安装全局 webcli 命令
echo   u  卸载 webcli（删除所有数据和代码）
echo   0  退出
echo.
exit /b 0

:do_restart
echo.
call restart.bat --bg
echo.
pause
exit /b 0

:do_stop
echo.
call restart.bat stop
echo.
pause
exit /b 0

:do_update
echo.
call update.bat
echo.
pause
exit /b 0

:do_link
echo.
call restart.bat status >nul 2>&1
if errorlevel 1 (
  echo [webcli] 服务没在跑，先选 1 启动
  pause
  exit /b 0
)
type "%LOG_FILE%" | findstr /C:"listening on"
echo.
echo 手机扫二维码即可连接；链接含 token，不要公开分享。
pause
exit /b 0

:do_auth
echo.
call auth.bat status
set "WASON=0"
call auth.bat status | findstr /C:"已开启" >nul
if not errorlevel 1 set "WASON=1"
echo.
if "%WASON%"=="1" (
  set /p "YN=二次验证当前是【开】，要关掉吗？[y/N] "
  if /I "!YN!"=="y" call auth.bat off
) else (
  set /p "YN=二次验证当前是【关】，要开启吗？会生成一把新密钥 [y/N] "
  if /I "!YN!"=="y" call auth.bat on
)
echo.
echo 立即生效，不需要重启，正在跑的终端不受影响。
pause
exit /b 0

:do_token
echo.
call token.bat status
echo.
set /p "YN=重新生成会立刻断开所有已连接设备、旧链接全部失效，继续？[y/N] "
if /I "!YN!"=="y" call token.bat regen
pause
exit /b 0

:do_log
echo.
call log.bat status
set "WASON=0"
call log.bat status | findstr /C:"已开启" >nul
if not errorlevel 1 set "WASON=1"
echo.
if "%WASON%"=="1" (
  set /p "YN=会话记录当前是【开】，要关掉吗？[y/N] "
  if /I "!YN!"=="y" call log.bat off
) else (
  set /p "YN=会话记录当前是【关】，要开启吗？[y/N] "
  if /I "!YN!"=="y" call log.bat on
)
pause
exit /b 0

:do_logs
echo.
echo Ctrl-C 停止跟踪
echo.
powershell -NoProfile -Command "Get-Content '%LOG_FILE%' -Wait"
pause
exit /b 0

:do_install_cli
set "PROJECT_DIR=%CD%"
set "TARGET_DIR="
if exist "%LOCALAPPDATA%\Microsoft\WindowsApps" set "TARGET_DIR=%LOCALAPPDATA%\Microsoft\WindowsApps"
if defined TARGET_DIR (
  > "%TARGET_DIR%\webcli.bat" echo @echo off
  >> "%TARGET_DIR%\webcli.bat" echo call "%PROJECT_DIR%\webcli.bat" %%*
  echo [webcli] 已安装: %TARGET_DIR%\webcli.bat
  echo 现在任何目录敲 webcli 都能呼出面板，webcli 3 直接更新重启
) else (
  echo [webcli] 找不到可写目录，手动把本项目目录加进 PATH:
  echo   setx PATH "%%PATH%%;%PROJECT_DIR%"
)
exit /b 0

:do_uninstall
echo.
call uninstall.bat
echo.
pause
exit /b 0
