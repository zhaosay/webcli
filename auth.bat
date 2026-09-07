@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DATA_DIR=..\data\webcli"
set "FLAG_FILE=%DATA_DIR%\auth-enabled"
set "KEY_FILE=%DATA_DIR%\secondary-key.txt"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if "%~1"=="on" goto on
if "%~1"=="off" goto off
if "%~1"=="status" goto status
goto usage

:on
set "KEY="
for /f "delims=" %%K in ('node -e "console.log(require('crypto').randomBytes(8).toString('hex'))"') do set "KEY=%%K"
node -e "require('fs').writeFileSync(process.argv[1],process.argv[2])" "%KEY_FILE%" "%KEY%"
node -e "require('fs').writeFileSync(process.argv[1],'1')" "%FLAG_FILE%"
echo [webcli] 二次验证已开启，无需重启服务即可生效
echo [webcli] 新密钥: %KEY%
echo [webcli] 把这把密钥单独发给需要连接的人（不要和访问链接放在一起）
goto :eof

:off
node -e "require('fs').writeFileSync(process.argv[1],'0')" "%FLAG_FILE%"
del "%KEY_FILE%" >nul 2>&1
echo [webcli] 二次验证已关闭，无需重启服务即可生效
goto :eof

:status
set "ENABLED=0"
if exist "%FLAG_FILE%" set /p ENABLED=<"%FLAG_FILE%"
if "!ENABLED!"=="1" (
  echo [webcli] 当前状态: 已开启
  if exist "%KEY_FILE%" (
    set /p CURKEY=<"%KEY_FILE%"
    echo [webcli] 当前密钥: !CURKEY!
  )
) else (
  echo [webcli] 当前状态: 已关闭
)
goto :eof

:usage
echo 用法: auth.bat on ^| off ^| status
echo   on      开启二次验证（每次都会生成一把新密钥）
echo   off     关闭二次验证
echo   status  查看当前状态
exit /b 1
