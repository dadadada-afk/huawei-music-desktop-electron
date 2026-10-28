@echo off
setlocal
cd /d "%~dp0"
rem Electron becomes a plain Node process when this variable is set.
set "ELECTRON_RUN_AS_NODE="
set "APP=%~dp0node_modules\electron\dist\electron.exe"
set "ENTRY=%~dp0out\main\index.js"
if not exist "%APP%" goto missing
if not exist "%ENTRY%" goto build
start "" "%APP%" "%ENTRY%"
exit /b 0

:build
echo out\main\index.js not found. Building...
call npm run build
if errorlevel 1 goto buildfail
start "" "%APP%" "%ENTRY%"
exit /b 0

:missing
echo Cannot find electron runtime. Run: npm install
pause
exit /b 1

:buildfail
echo Build failed. See the log above.
pause
exit /b 1
