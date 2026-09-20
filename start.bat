@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist restart.bat call restart.bat stop

if not exist node_modules (
  echo [webcli] node_modules not found, running npm install...
  call npm install
  if errorlevel 1 (
    echo [webcli] npm install failed.
    pause
    exit /b 1
  )
)

REM Absolute path so the running process's command line unambiguously
REM identifies this project directory - restart.bat's kill_if_tracked relies
REM on that to avoid ever killing an unrelated process that got the same PID.
node "%~dp0server.js"
if errorlevel 1 (
  echo [webcli] server exited with an error.
  echo [webcli] 如果是端口被占用，换个端口再试: set PROJECT_PORT=3060 ^&^& start.bat
  pause
)
