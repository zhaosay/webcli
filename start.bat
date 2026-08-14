@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo [webcli] node_modules not found, running npm install...
  call npm install
  if errorlevel 1 (
    echo [webcli] npm install failed.
    pause
    exit /b 1
  )
)

node server.js
if errorlevel 1 (
  echo [webcli] server exited with an error.
  pause
)
