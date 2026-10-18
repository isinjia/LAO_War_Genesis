@echo off
rem LAO War Genesis: starts a local web server in this folder and opens the game in the browser.
rem Double-click to run. Close this window to stop the server.
chcp 65001 >nul
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8790

rem already running? just open the game
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1', %PORT%)).Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo Server already running on port %PORT%.
  if not defined NOOPEN start "" "http://localhost:%PORT%/"
  exit /b 0
)

rem pick a Python: python, then the py launcher
set PY=
where python >nul 2>&1 && set PY=python
if not defined PY ( where py >nul 2>&1 && set PY=py )
if not defined PY (
  echo Python was not found. Install it from https://www.python.org/downloads/ ^(check "Add python.exe to PATH"^) and run this again.
  pause
  exit /b 1
)

echo LAO War Genesis - http://localhost:%PORT%/
echo Close this window to stop the server.
rem open the browser a moment after the server starts
if not defined NOOPEN start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:%PORT%/'"
%PY% -m http.server %PORT% --bind 127.0.0.1
