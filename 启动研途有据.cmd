@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules call npm ci
if errorlevel 1 goto fail
call npm run doctor
if errorlevel 1 goto fail
if not exist dist\index.html call npm run build
if errorlevel 1 goto fail
echo 请打开 http://127.0.0.1:4327
call npm run start
:fail
pause
