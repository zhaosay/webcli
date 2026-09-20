@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "DATA_DIR=..\data\webcli"
set "PORT_FILE=%DATA_DIR%\port.txt"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

if /I "%~1"=="set" goto set_port
if /I "%~1"=="status" goto status
goto usage

:set_port
set "NEWPORT=%~2"
echo %NEWPORT%| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo [webcli] 端口必须是 1-65535 之间的数字
  exit /b 1
)
if %NEWPORT% LSS 1 (
  echo [webcli] 端口必须是 1-65535 之间的数字
  exit /b 1
)
if %NEWPORT% GTR 65535 (
  echo [webcli] 端口必须是 1-65535 之间的数字
  exit /b 1
)
> "%PORT_FILE%" echo %NEWPORT%
echo [webcli] 端口已设置为 %NEWPORT%，重启服务后生效（面板选 1，或执行 restart.bat --bg）
goto :eof

:status
if "%PROJECT_PORT%"=="" (
  if exist "%PORT_FILE%" (
    set /p CUR_PORT=<"%PORT_FILE%"
  ) else (
    set "CUR_PORT=3050"
  )
) else (
  set "CUR_PORT=%PROJECT_PORT%"
)
echo [webcli] 当前配置端口: %CUR_PORT%
if not "%PROJECT_PORT%"=="" (
  echo [webcli] 环境变量 PROJECT_PORT=%PROJECT_PORT% 当前优先生效，覆盖了保存的端口
)
goto :eof

:usage
echo 用法: port.bat set ^<端口号^> ^| status
echo   set ^<端口号^>  修改监听端口，需要重启服务才能生效
echo   status        查看当前配置的端口
exit /b 1
