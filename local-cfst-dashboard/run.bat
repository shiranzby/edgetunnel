@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "NODE_EXE=%~dp0runtime\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node.exe"

if not exist "server.mjs" (
  echo [ERROR] server.mjs not found in: %CD%
  goto END
)

"%NODE_EXE%" -v >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Please keep runtime\node.exe in this folder, or install Node.js 18+.
  goto END
)

echo ==================================================
echo   ShyVPN CFST Dashboard
echo ==================================================
echo WebUI: http://127.0.0.1:8789
echo API:   http://127.0.0.1:8789/api/plain
echo Folder: %CD%
echo.
echo Opening browser...
start "" "http://127.0.0.1:8789"
echo Starting server. Keep this window open.
echo.
"%NODE_EXE%" server.mjs

echo.
echo [INFO] Server exited with code %ERRORLEVEL%.

:END
echo.
echo Press any key to close this window.
pause >nul