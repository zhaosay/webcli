@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PID_FILE=..\data\webcli\server.pid"
if exist "%PID_FILE%" (
  set /p OLD_PID=<"%PID_FILE%"
  tasklist /FI "PID eq !OLD_PID!" 2>nul | find "!OLD_PID!" >nul
  if not errorlevel 1 (
    echo [webcli] stopping running instance ^(pid !OLD_PID!^)...
    taskkill /PID !OLD_PID! /F >nul 2>&1
    timeout /t 1 /nobreak >nul
  )
)

call start.bat
