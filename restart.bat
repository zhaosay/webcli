@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%~1"=="stop" goto stop
goto default

:stop
call :kill_if_tracked
goto :eof

:kill_if_tracked
set "PID_FILE=..\data\webcli\server.pid"
if exist "%PID_FILE%" (
  set /p OLD_PID=<"%PID_FILE%"
  tasklist /FI "PID eq !OLD_PID!" 2>nul | find "!OLD_PID!" >nul
  if not errorlevel 1 (
    echo [webcli] stopping running instance ^(pid !OLD_PID!^)...
    taskkill /PID !OLD_PID! /F >nul 2>&1
    timeout /t 1 /nobreak >nul
  )
  del "%PID_FILE%" >nul 2>&1
)
exit /b 0

:default
call :kill_if_tracked
call start.bat
