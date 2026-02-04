@echo off
:: BEAM Light Wallet - Windows One-Click Installer
:: Developed by @vsnation
:: Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
:: Double-click to install and run

setlocal enabledelayedexpansion

echo.
echo ======================================================
echo        BEAM Light Wallet - Windows Installer
echo        Developed by @vsnation
echo ======================================================
echo.

:: Check for admin rights (optional, for firewall rules)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Note: Running without admin rights. Firewall rules may need manual setup.
    echo.
)

:: Configuration
set "BEAM_VERSION=7.5.13882"
set "INSTALL_DIR=%USERPROFILE%\Beam-Light-Wallet"
set "PORT=9080"
set "GITHUB_BASE=https://github.com/BeamMW/beam/releases/download/beam-%BEAM_VERSION%"

echo Installation directory: %INSTALL_DIR%
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python 3 is required but not installed.
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Or run: winget install Python.Python.3.11
    echo.
    echo IMPORTANT: Check "Add Python to PATH" during installation!
    echo.
    pause
    exit /b 1
)

echo [OK] Python found
python --version

:: Create directories
echo.
echo Creating directories...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\binaries\windows" mkdir "%INSTALL_DIR%\binaries\windows"
if not exist "%INSTALL_DIR%\wallets" mkdir "%INSTALL_DIR%\wallets"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"
if not exist "%INSTALL_DIR%\src" mkdir "%INSTALL_DIR%\src"
if not exist "%INSTALL_DIR%\src\js" mkdir "%INSTALL_DIR%\src\js"
if not exist "%INSTALL_DIR%\src\css" mkdir "%INSTALL_DIR%\src\css"

:: Download binaries
echo.
echo Downloading BEAM binaries v%BEAM_VERSION%...
echo This may take a few minutes...
echo.

cd /d "%INSTALL_DIR%\binaries\windows"

:: Download wallet-api
if not exist "wallet-api.exe" (
    echo Downloading wallet-api...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GITHUB_BASE%/windows-wallet-api-%BEAM_VERSION%.zip' -OutFile 'wallet-api.zip'}"
    if exist "wallet-api.zip" (
        powershell -Command "Expand-Archive -Path 'wallet-api.zip' -DestinationPath '.' -Force"
        if exist "wallet-api.tar" (
            tar -xf wallet-api.tar 2>nul
            del wallet-api.tar
        )
        del wallet-api.zip
        echo [OK] wallet-api downloaded
    ) else (
        echo [ERROR] Failed to download wallet-api
    )
) else (
    echo [OK] wallet-api already exists
)

:: Download beam-wallet
if not exist "beam-wallet.exe" (
    echo Downloading beam-wallet...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GITHUB_BASE%/windows-beam-wallet-cli-%BEAM_VERSION%.zip' -OutFile 'beam-wallet.zip'}"
    if exist "beam-wallet.zip" (
        powershell -Command "Expand-Archive -Path 'beam-wallet.zip' -DestinationPath '.' -Force"
        if exist "beam-wallet.tar" (
            tar -xf beam-wallet.tar 2>nul
            del beam-wallet.tar
        )
        del beam-wallet.zip
        echo [OK] beam-wallet downloaded
    ) else (
        echo [ERROR] Failed to download beam-wallet
    )
) else (
    echo [OK] beam-wallet already exists
)

:: Download beam-node (optional)
if not exist "beam-node.exe" (
    echo Downloading beam-node (optional)...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GITHUB_BASE%/windows-beam-node-%BEAM_VERSION%.zip' -OutFile 'beam-node.zip'}" 2>nul
    if exist "beam-node.zip" (
        powershell -Command "Expand-Archive -Path 'beam-node.zip' -DestinationPath '.' -Force" 2>nul
        if exist "beam-node.tar" (
            tar -xf beam-node.tar 2>nul
            del beam-node.tar
        )
        del beam-node.zip
        echo [OK] beam-node downloaded
    )
) else (
    echo [OK] beam-node already exists
)

cd /d "%INSTALL_DIR%"

:: Download wallet source files
echo.
echo Downloading wallet application files...

:: For now, create a minimal serve.py if it doesn't exist
:: In production, this would download from GitHub releases
if not exist "serve.py" (
    echo Creating server file...
    echo Please download serve.py from the BEAM Light Wallet repository
    echo and place it in: %INSTALL_DIR%
)

:: Create start script
echo.
echo Creating launcher scripts...

(
echo @echo off
echo cd /d "%%~dp0"
echo echo Starting BEAM Light Wallet...
echo echo.
echo echo Open http://127.0.0.1:%PORT% in your browser
echo echo Press Ctrl+C to stop the wallet
echo echo.
echo python serve.py %PORT%
) > "%INSTALL_DIR%\Start-Wallet.bat"

:: Create stop script
(
echo @echo off
echo echo Stopping BEAM Light Wallet...
echo taskkill /F /IM python.exe /FI "WINDOWTITLE eq *serve.py*" 2^>nul
echo taskkill /F /IM wallet-api.exe 2^>nul
echo taskkill /F /IM beam-node.exe 2^>nul
echo echo Done.
echo pause
) > "%INSTALL_DIR%\Stop-Wallet.bat"

:: Create desktop shortcut
echo Creating desktop shortcut...
powershell -Command "& {$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\BEAM Light Wallet.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\Start-Wallet.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Description = 'BEAM Light Wallet'; $Shortcut.Save()}"

echo.
echo ======================================================
echo        Installation Complete!
echo ======================================================
echo.
echo Installation directory: %INSTALL_DIR%
echo.
echo To start the wallet:
echo   1. Double-click "BEAM Light Wallet" on your Desktop
echo   2. Or run: %INSTALL_DIR%\Start-Wallet.bat
echo.
echo Then open: http://127.0.0.1:%PORT%
echo.

:: Ask to start now
set /p START_NOW="Start the wallet now? (Y/N): "
if /i "%START_NOW%"=="Y" (
    echo.
    echo Starting wallet...
    start "" "http://127.0.0.1:%PORT%"
    timeout /t 3 /nobreak >nul
    cd /d "%INSTALL_DIR%"
    python serve.py %PORT%
) else (
    echo.
    echo You can start the wallet later using the desktop shortcut.
    pause
)
