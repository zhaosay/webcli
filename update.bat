@echo off
cd /d "%~dp0"

echo [webcli] pulling latest changes...
git pull --ff-only
if errorlevel 1 (
  echo [webcli] git pull failed - resolve manually.
  pause
  exit /b 1
)

git diff --name-only HEAD@{1} HEAD > "%TEMP%\webcli_update_diff.txt" 2>nul
findstr /C:"package.json" /C:"package-lock.json" "%TEMP%\webcli_update_diff.txt" >nul
if %errorlevel%==0 (
  echo [webcli] package.json changed, running npm install...
  call npm install
)
del "%TEMP%\webcli_update_diff.txt" >nul 2>&1

echo [webcli] update complete. Restart the server to apply changes:
echo   - re-run start.bat
pause
