@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"
set "DATA_DIR=%PROJECT_DIR%\..\data\webcli"

echo 本操作会永久删除:
echo   - 项目代码目录: %PROJECT_DIR%
echo   - 运行时数据目录: %DATA_DIR% (token、二次验证密钥、会话日志等)

schtasks /query /tn "webcli" >nul 2>&1
if not errorlevel 1 echo   - 开机自启计划任务: webcli
echo.

echo 这个操作不可撤销。确认删除请输入大写 DELETE，其他任意输入取消:
set /p CONFIRM=
if not "%CONFIRM%"=="DELETE" (
  echo [webcli] 已取消，什么都没有删除
  exit /b 1
)

call restart.bat stop >nul 2>&1

schtasks /query /tn "webcli" >nul 2>&1
if not errorlevel 1 (
  schtasks /delete /tn "webcli" /f >nul 2>&1
  echo [webcli] 已移除开机自启计划任务
)

rmdir /s /q "%DATA_DIR%" >nul 2>&1
echo [webcli] 已删除数据目录

REM 不能在当前批处理运行时直接删除它自己所在的目录（文件会被占用而失败），
REM 所以把收尾步骤写成一个独立的小脚本，放到 %TEMP%，等这个进程退出、
REM 释放掉对项目目录里所有文件的占用之后，由它来删除项目目录。
echo [webcli] 即将删除项目目录，完成后此窗口会自动关闭...
set "CLEANUP=%TEMP%\webcli_cleanup_%RANDOM%.bat"
> "%CLEANUP%" echo @echo off
>> "%CLEANUP%" echo timeout /t 2 /nobreak ^>nul
>> "%CLEANUP%" echo rmdir /s /q "%PROJECT_DIR%"
>> "%CLEANUP%" echo echo [webcli] 卸载完成
>> "%CLEANUP%" echo timeout /t 3 /nobreak ^>nul
>> "%CLEANUP%" echo del "%%~f0"
cd /d "%TEMP%"
start "" /min "%CLEANUP%"
exit
