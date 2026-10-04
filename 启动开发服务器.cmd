@echo off
rem ===========================================================================
rem  jiwei - DEV server (hot reload)  ->  http://localhost:5273/
rem
rem  Double-click this file. A console window opens and stays open while the
rem  server runs. Press Ctrl+C or just close the window to stop it.
rem
rem  NOTE: this file is intentionally ASCII-only. A .cmd containing Chinese
rem  text renders as garbage on consoles whose code page is not UTF-8.
rem  The Chinese description lives in the FILE NAME instead.
rem ===========================================================================
chcp 65001 >nul
cd /d "%~dp0"
title jiwei - DEV (5273)

rem Never let corepack stop and ask "do you want to download pnpm?".
rem A double-clicked window that waits for a keypress looks like a hang.
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"

echo ============================================================
echo   jiwei  -  DEV server
echo.
echo   PC     : http://localhost:5273/
echo   Phone  : see the "Network:" line printed below
echo            (same Wi-Fi required)
echo.
echo   Edits to the code reload the browser automatically.
echo   Keep this window OPEN while you work.
echo ============================================================
echo.

rem --- pick a package manager -------------------------------------------------
rem pnpm is NOT installed globally on every machine. Fall back to corepack,
rem which ships with Node.js and reads "packageManager" from package.json.
set "PM="
where pnpm >nul 2>nul && set "PM=pnpm"
if not defined PM (
  where corepack >nul 2>nul && set "PM=corepack pnpm"
)
if not defined PM (
  echo [!] Neither "pnpm" nor "corepack" was found.
  echo.
  echo     Install Node.js 22 or newer from https://nodejs.org/
  echo     then open PowerShell and run:
  echo.
  echo         npm install -g pnpm
  echo.
  pause
  exit /b 1
)
echo [i] package manager: %PM%
echo.
rem corepack downloads pnpm on first use, silently. Say so, or the window
rem looks frozen for half a minute.
echo %PM% | findstr /c:"corepack" >nul && echo [i] First run with corepack: it may download pnpm, please wait...
echo.

rem --- first run: install dependencies --------------------------------------
if not exist "node_modules" (
  echo [i] node_modules is missing - installing dependencies now.
  echo     This can take a few minutes on the first run.
  echo.
  call %PM% install
  if errorlevel 1 (
    echo.
    echo [!] install failed. If the network is unstable, run this instead:
    echo         node scripts\install-retry.mjs 12
    pause
    exit /b 1
  )
)

echo [i] Starting the dev server. Press Ctrl+C to stop.
echo.
call %PM% dev

echo.
echo [server stopped]
pause
