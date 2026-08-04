@echo off
REM ---------------------------------------------------------------------------
REM BEAM Light Wallet - stop all services
REM
REM Mirrors the script BEAM-LightWallet-Setup.ps1 writes at install time.
REM Matches the console window title set by Start-Wallet.bat so that unrelated
REM python.exe processes are left alone.
REM ---------------------------------------------------------------------------
echo Stopping BEAM Light Wallet...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *BEAM Light Wallet*" 2>nul
taskkill /F /IM wallet-api.exe 2>nul
taskkill /F /IM beam-node.exe 2>nul
echo Done.
