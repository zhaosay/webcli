@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DATA_DIR=..\data\webcli"
set "FLAG_FILE=%DATA_DIR%\log-enabled"
set "LOGS_DIR=%DATA_DIR%\logs"
if "%LOG_RETENTION_DAYS%"=="" (set "RETENTION_DAYS=7") else (set "RETENTION_DAYS=%LOG_RETENTION_DAYS%")

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if "%~1"=="on" goto on
if "%~1"=="off" goto off
if "%~1"=="status" goto status
if "%~1"=="list" goto list
goto usage

:on
node -e "require('fs').writeFileSync(process.argv[1],'1')" "%FLAG_FILE%"
echo [webcli] 会话记录已开启，无需重启服务即可生效（只影响新建立的连接，已经连着的不受影响）
echo [webcli] 从现在起，新连接的屏幕输出会被记录到 %LOGS_DIR%\，保留 %RETENTION_DAYS% 天后自动清理
echo [webcli] 注意：终端里 cat/查看的任何敏感内容都会原样进日志，请把这个目录当敏感文件对待
goto :eof

:off
node -e "require('fs').writeFileSync(process.argv[1],'0')" "%FLAG_FILE%"
echo [webcli] 会话记录已关闭，无需重启服务即可生效
goto :eof

:status
set "ENABLED=0"
if exist "%FLAG_FILE%" (
  set /p ENABLED=<"%FLAG_FILE%"
)
if "!ENABLED!"=="1" (
  echo [webcli] 当前状态: 已开启（保留 %RETENTION_DAYS% 天）
) else (
  echo [webcli] 当前状态: 已关闭
)
if exist "%LOGS_DIR%" (
  for /f %%C in ('dir /b "%LOGS_DIR%\*.log" 2^>nul ^| find /c /v ""') do set "COUNT=%%C"
  echo [webcli] 当前日志: !COUNT! 个文件
) else (
  echo [webcli] 当前日志: 0 个文件
)
goto :eof

:list
if exist "%LOGS_DIR%" (
  dir /o-d "%LOGS_DIR%"
) else (
  echo [webcli] 还没有日志文件
)
goto :eof

:usage
echo 用法: log.bat on ^| off ^| status ^| list
echo   on      开启会话记录（只记屏幕输出，不记按键），实时生效不需要重启
echo   off     关闭会话记录
echo   status  查看当前状态和日志数量
echo   list    按时间列出所有日志文件
exit /b 1
