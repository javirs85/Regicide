@echo off
setlocal

set "ROOT=%~dp0"
set "URL=http://localhost:5173"
set "NODE_DIR=%ROOT%.tools\node-v24.14.0-win-x64"
set "NPM=%NODE_DIR%\npm.cmd"

cd /d "%ROOT%"

where npm >nul 2>nul
if exist "%NPM%" (
  set "NPM_CMD=%NPM%"
) else if not errorlevel 1 (
  set "NPM_CMD=npm"
) else (
  echo Could not find npm. Expected "%NPM%" or npm on PATH.
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules\" (
  echo Installing dependencies...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting Regicide dev server...
  start "Regicide Vite" /D "%ROOT%" /min cmd /k ""%NPM_CMD%" run dev -- --host 127.0.0.1 --port 5173 --strictPort"

  echo Waiting for %URL% ...
  for /l %%i in (1,1,30) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 1; if ($r.StatusCode -lt 500) { exit 0 } } catch { exit 1 }" >nul 2>nul
    if not errorlevel 1 goto open_browser
    timeout /t 1 /nobreak >nul
  )

  echo The dev server did not respond yet. Opening the browser anyway.
) else (
  echo Regicide dev server is already running on %URL%.
)

:open_browser
start "" "%URL%"
endlocal
