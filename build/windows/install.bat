@echo off
:: ============================================================================
:: BEAM Light Wallet - Windows One-Click Installer
:: ============================================================================
:: Developed by @vsnation
:: Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
:: ============================================================================

setlocal EnableDelayedExpansion

echo.
echo ======================================================================
echo           BEAM Light Wallet - Windows Installer
echo                    Developed by @vsnation
echo ======================================================================
echo.
echo Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
echo.

:: Configuration
set "BEAM_VERSION=7.5.13882"
set "INSTALL_DIR=%USERPROFILE%\BEAM-LightWallet"
set "PORT=9080"
set "GITHUB_BASE=https://github.com/BeamMW/beam/releases/download/beam-%BEAM_VERSION%"

:: Check Python
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    python3 --version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ERROR: Python 3 is required but not installed.
        echo.
        echo Download from: https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    )
    set "PYTHON=python3"
) else (
    set "PYTHON=python"
)

echo Python found: OK

:: Check curl (Windows 10+ has it built-in)
echo Checking curl...
curl --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: curl not found. Please install curl or use Windows 10+
    pause
    exit /b 1
)
echo curl found: OK

:: Create install directory
echo.
echo Installing to: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"

:: Create directories
if not exist "binaries\windows" mkdir "binaries\windows"
if not exist "wallets" mkdir "wallets"
if not exist "logs" mkdir "logs"
if not exist "src\css" mkdir "src\css"
if not exist "src\js" mkdir "src\js"

:: Download BEAM binaries
echo.
echo Downloading BEAM binaries v%BEAM_VERSION%...
cd binaries\windows

if not exist "wallet-api.exe" (
    echo   - wallet-api...
    curl -L --progress-bar "%GITHUB_BASE%/windows-wallet-api-%BEAM_VERSION%.zip" -o wallet-api.zip
    tar -xf wallet-api.zip 2>nul || powershell -Command "Expand-Archive -Path wallet-api.zip -DestinationPath . -Force"
    del wallet-api.zip 2>nul
    echo   [OK] wallet-api
)

if not exist "beam-wallet.exe" (
    echo   - beam-wallet...
    curl -L --progress-bar "%GITHUB_BASE%/windows-beam-wallet-cli-%BEAM_VERSION%.zip" -o beam-wallet.zip
    tar -xf beam-wallet.zip 2>nul || powershell -Command "Expand-Archive -Path beam-wallet.zip -DestinationPath . -Force"
    del beam-wallet.zip 2>nul
    echo   [OK] beam-wallet
)

if not exist "beam-node.exe" (
    echo   - beam-node (optional)...
    curl -L --progress-bar "%GITHUB_BASE%/windows-beam-node-%BEAM_VERSION%.zip" -o beam-node.zip 2>nul
    if exist beam-node.zip (
        tar -xf beam-node.zip 2>nul || powershell -Command "Expand-Archive -Path beam-node.zip -DestinationPath . -Force"
        del beam-node.zip 2>nul
        echo   [OK] beam-node
    ) else (
        echo   [SKIP] beam-node (optional)
    )
)

cd "%INSTALL_DIR%"

:: Create launcher batch file
echo.
echo Creating launcher script...
(
echo @echo off
echo cd /d "%%~dp0"
echo echo.
echo echo ======================================================================
echo echo                    BEAM Light Wallet
echo echo                    Developed by @vsnation
echo echo ======================================================================
echo echo.
echo echo Starting wallet server on port %PORT%...
echo echo Access URL: http://127.0.0.1:%PORT%
echo echo.
echo echo Press Ctrl+C to stop
echo echo.
echo start "" "http://127.0.0.1:%PORT%"
echo %PYTHON% serve.py %PORT%
) > start-wallet.bat

:: Create stop script
(
echo @echo off
echo taskkill /F /IM python.exe /FI "WINDOWTITLE eq BEAM*" 2^>nul
echo taskkill /F /IM wallet-api.exe 2^>nul
echo taskkill /F /IM beam-node.exe 2^>nul
echo echo BEAM Light Wallet stopped
) > stop-wallet.bat

:: Create desktop shortcut
echo Creating desktop shortcut...
set "SHORTCUT=%USERPROFILE%\Desktop\BEAM Light Wallet.lnk"
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%INSTALL_DIR%\start-wallet.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'BEAM Light Wallet - Privacy Wallet'; $s.Save()"

echo.
echo ======================================================================
echo              Installation Complete!
echo ======================================================================
echo.
echo Install location: %INSTALL_DIR%
echo.
echo To start the wallet:
echo   - Double-click "BEAM Light Wallet" on your Desktop
echo   - Or run: %INSTALL_DIR%\start-wallet.bat
echo.
echo Then open: http://127.0.0.1:%PORT%
echo.
echo To stop: Run stop-wallet.bat or close the terminal window
echo.

set /p START="Start the wallet now? [Y/n] "
if /i "%START%"=="" set START=Y
if /i "%START%"=="Y" (
    echo.
    echo Starting wallet...
    start "" "%INSTALL_DIR%\start-wallet.bat"
)

echo.
pause
