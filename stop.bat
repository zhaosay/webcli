@echo off
chcp 65001 >nul
cd /d "%~dp0"
call restart.bat stop
echo.
pause
