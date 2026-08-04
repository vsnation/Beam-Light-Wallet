@echo off
REM ---------------------------------------------------------------------------
REM BEAM Light Wallet - launcher
REM
REM This is the same script BEAM-LightWallet-Setup.ps1 writes at install time.
REM It is checked in as well because beam-wallet-inno.iss ships it verbatim
REM (the Inno installer does not generate it).
REM
REM No BEAM version appears here: serve.py reads config\binaries.json itself.
REM ---------------------------------------------------------------------------
setlocal
set PORT=9080

cd /d "%~dp0"
title BEAM Light Wallet

echo.
echo   BEAM Light Wallet
echo   =================
echo.
echo   Starting server on http://127.0.0.1:%PORT%
echo   Press Ctrl+C to stop
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo   Python 3 was not found on PATH.
    echo.
    echo   Install it from https://www.python.org/downloads/ and tick
    echo   "Add Python to PATH" during installation, then run this again.
    echo.
    pause
    exit /b 1
)

if not exist "serve.py" (
    echo   serve.py not found in %CD%.
    echo   Reinstall BEAM Light Wallet or run this script from its install folder.
    echo.
    pause
    exit /b 1
)

start "" "http://127.0.0.1:%PORT%"
python serve.py %PORT%
