@echo off
:: LocalChat — native startup for Windows
setlocal EnableDelayedExpansion

cd /d "%~dp0"

:: ── Check Node.js ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install Node.js 20+ from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -e "process.stdout.write(process.versions.node)"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
    echo [ERROR] Node.js %NODE_MAJOR% detected. LocalChat requires Node.js 18 or newer.
    pause
    exit /b 1
)

:: ── Install / update dependencies ─────────────────────────────────────────────
echo [INFO] Installing server dependencies...
cd server
call npm install --omit=dev --silent
cd ..

:: ── Build the React client if dist is missing ─────────────────────────────────
if not exist "client\dist" (
    echo [INFO] Building React client...
    cd client
    call npm install --silent
    call npm run build
    cd ..
) else (
    echo [INFO] Client build is up to date
)

:: ── Launch ────────────────────────────────────────────────────────────────────
echo.
echo [INFO] Starting LocalChat...
echo.
node server\index.js

pause
