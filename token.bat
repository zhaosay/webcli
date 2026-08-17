@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DATA_DIR=..\data\webcli"
set "TOKEN_FILE=%DATA_DIR%\token.txt"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if "%~1"=="regen" goto regen
if "%~1"=="status" goto status
goto usage

:regen
node -e "const fs=require('fs');const t=require('crypto').randomBytes(16).toString('hex');fs.writeFileSync(process.argv[1],t);" "%TOKEN_FILE%"
echo [webcli] 新 token 已生成，重启服务使其生效（旧链接会全部失效，所有当前连接会被断开）...
call restart.bat
goto :eof

:status
if exist "%TOKEN_FILE%" (
  set /p CUR_TOKEN=<"%TOKEN_FILE%"
  echo [webcli] 当前 token: !CUR_TOKEN!
) else (
  echo [webcli] 还没有 token（先启动一次服务会自动生成）
)
goto :eof

:usage
echo 用法: token.bat regen ^| status
echo   regen   生成新 token 并重启服务使其立即生效（会踢掉所有当前连接）
echo   status  查看当前 token
exit /b 1
