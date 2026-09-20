@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PID_FILE=..\data\webcli\server.pid"
set "LOG_FILE=.run\run.log"
set "PORT_FILE=..\data\webcli\port.txt"
if not "%PROJECT_PORT%"=="" (
  set "PORT=%PROJECT_PORT%"
) else if exist "%PORT_FILE%" (
  set /p PORT=<"%PORT_FILE%"
) else (
  set "PORT=3050"
)

if "%~1"=="stop" goto stop
if "%~1"=="status" goto status
if "%~1"=="--bg" goto bg
if "%~1"=="-b" goto bg
goto default

:stop
call :find_and_kill
goto :eof

:status
call :find_pid
if defined FOUND_PID (
  echo [webcli] running, pid %FOUND_PID%, port %PORT%
  findstr /C:"open:" "%LOG_FILE%" 2>nul
  exit /b 0
)
echo [webcli] not running
exit /b 1

REM ---------------------------------------------------------------------
REM A bare PID-file check isn't enough: Windows recycles PIDs quickly, so
REM a stale/未清理 pid file can point at a completely unrelated process by
REM the time we read it. Windows has no built-in way to read a process's
REM cwd (unlike macOS's `lsof -a -p PID -d cwd`), so the strongest check
REM available without extra tools is the command line: start.bat launches
REM with an absolute path (`node <projectdir>\server.js`), so a real
REM instance's command line always contains both "server.js" and this
REM project's own directory.
REM ---------------------------------------------------------------------
:is_ours
set "IS_OURS=0"
for /f "usebackq tokens=1,* delims==" %%A in (`wmic process where "ProcessId=%~1" get CommandLine /value 2^>nul`) do (
  if /I "%%A"=="CommandLine" (
    echo %%B | findstr /I "server.js" >nul
    if not errorlevel 1 (
      echo %%B | findstr /I /C:"%CD%" >nul
      if not errorlevel 1 set "IS_OURS=1"
    )
  )
)
exit /b 0

:find_pid
set "FOUND_PID="
if exist "%PID_FILE%" (
  set "CANDIDATE="
  set /p CANDIDATE=<"%PID_FILE%"
  if defined CANDIDATE (
    tasklist /FI "PID eq !CANDIDATE!" 2>nul | find "!CANDIDATE!" >nul
    if not errorlevel 1 (
      call :is_ours !CANDIDATE!
      if "!IS_OURS!"=="1" set "FOUND_PID=!CANDIDATE!"
    )
  )
)
REM Fallback used when the pid file is missing/stale but a webcli instance
REM (started some other way) still genuinely holds the port - mirrors
REM restart.sh's `lsof -ti "tcp:$PORT"` fallback scan.
if not defined FOUND_PID (
  for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr /C:":%PORT% "') do (
    if not defined FOUND_PID (
      call :is_ours %%P
      if "!IS_OURS!"=="1" set "FOUND_PID=%%P"
    )
  )
)
exit /b 0

:find_and_kill
call :find_pid
if defined FOUND_PID (
  echo [webcli] stopping running instance ^(pid !FOUND_PID!^)...
  taskkill /PID !FOUND_PID! /F >nul 2>&1
  timeout /t 1 /nobreak >nul
)
del "%PID_FILE%" >nul 2>&1
exit /b 0

:bg
call :find_and_kill
if not exist .run mkdir .run
echo. > "%LOG_FILE%"
start "" /min cmd /c "call start.bat >> "%LOG_FILE%" 2>&1"
set /a TRIES=0
:bg_wait
set /a TRIES+=1
findstr /C:"listening on" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo.
  type "%LOG_FILE%"
  echo.
  echo [webcli] 日志: type %LOG_FILE%
  goto :eof
)
findstr /C:"EADDRINUSE" "%LOG_FILE%" >nul 2>&1
if not errorlevel 1 (
  echo [webcli] 端口 %PORT% 被别的程序占用（不是 webcli，所以没有动它）
  echo [webcli] 换个端口: set PROJECT_PORT=3060 ^&^& restart.bat --bg
  goto :eof
)
if %TRIES% GEQ 240 (
  echo [webcli] 等了很久还没就绪，看看 %LOG_FILE%
  goto :eof
)
timeout /t 1 /nobreak >nul
goto bg_wait

:default
call :find_and_kill
call start.bat
