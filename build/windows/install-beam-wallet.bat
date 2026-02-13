@echo off
:: ============================================================================
:: BEAM Light Wallet - Windows Setup (legacy name)
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
set "PORT=9080"
set "GITHUB_BASE=https://github.com/BeamMW/beam/releases/download/beam-%BEAM_VERSION%"
set "WALLET_REPO=https://github.com/vsnation/Beam-Light-Wallet/archive/refs/heads/main.zip"

:: Private data stored in %USERPROFILE%\.beam-light-wallet
set "DATA_DIR=%USERPROFILE%\.beam-light-wallet"
set "BINARIES_DIR=%DATA_DIR%\binaries\windows"
set "WALLETS_DIR=%DATA_DIR%\wallets"
set "LOGS_DIR=%DATA_DIR%\logs"
set "NODE_DATA_DIR=%DATA_DIR%\node_data"

:: App code directory
set "INSTALL_DIR=%USERPROFILE%\BEAM-LightWallet"

echo App code:     %INSTALL_DIR%
echo Private data: %DATA_DIR%
echo.

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

:: Create directories
echo.
echo Creating directories...
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%BINARIES_DIR%" mkdir "%BINARIES_DIR%"
if not exist "%WALLETS_DIR%" mkdir "%WALLETS_DIR%"
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"
if not exist "%NODE_DATA_DIR%" mkdir "%NODE_DATA_DIR%"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Migrate from old location if exists
set "OLD_INSTALL=%USERPROFILE%\Beam-Light-Wallet"
if exist "%OLD_INSTALL%\wallets" (
    if not exist "%WALLETS_DIR%\*" (
        echo Migrating wallets from old location...
        xcopy /E /Y /Q "%OLD_INSTALL%\wallets\*" "%WALLETS_DIR%\" >nul 2>&1
    )
)
if exist "%OLD_INSTALL%\binaries\windows" (
    if not exist "%BINARIES_DIR%\wallet-api.exe" (
        echo Migrating binaries from old location...
        xcopy /E /Y /Q "%OLD_INSTALL%\binaries\windows\*" "%BINARIES_DIR%\" >nul 2>&1
    )
)

:: ============================================================================
:: STEP 1: Download wallet application files from GitHub
:: ============================================================================
echo.
echo Downloading wallet application...
cd /d "%INSTALL_DIR%"

:: Check if wallet is FULLY installed (serve.py AND src/index.html must exist)
if exist "serve.py" (
    if exist "src\index.html" (
        echo   [OK] Wallet application already installed
        goto :app_installed
    )
)

:: Download wallet application
echo   - Downloading from GitHub...
if exist wallet-app.zip del /f wallet-app.zip
curl -L -f --retry 3 --progress-bar "%WALLET_REPO%" -o wallet-app.zip
if errorlevel 1 (
    echo   [ERROR] Failed to download wallet application
    echo   Please check your internet connection
    goto :app_download_error
)

echo   - Extracting...
tar -xf wallet-app.zip 2>nul
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'wallet-app.zip' -DestinationPath '.' -Force" 2>nul
)

:: Move files from extracted folder to install dir
if exist "Beam-Light-Wallet-main" (
    echo   - Installing files...
    xcopy /E /Y /Q "Beam-Light-Wallet-main\*" "." >nul 2>&1
    rd /s /q "Beam-Light-Wallet-main" 2>nul
)

del wallet-app.zip 2>nul

:: Verify installation
if not exist "serve.py" (
    echo   [ERROR] serve.py not found after extraction
    goto :app_download_error
)
if not exist "src\index.html" (
    echo   [ERROR] src/index.html not found after extraction
    goto :app_download_error
)
echo   [OK] Wallet application installed

:app_installed

:: ============================================================================
:: STEP 2: Download BEAM binaries to ~/.beam-light-wallet/binaries/windows/
:: ============================================================================
echo.
echo Downloading BEAM binaries v%BEAM_VERSION%...
echo   Target: %BINARIES_DIR%
cd /d "%BINARIES_DIR%"

if not exist "wallet-api.exe" (
    echo   - wallet-api...

    :: Delete any existing corrupt file
    if exist wallet-api.zip del /f wallet-api.zip

    :: Download with retry
    curl -L -f --retry 3 --retry-delay 2 --progress-bar "%GITHUB_BASE%/win-wallet-api-%BEAM_VERSION%.zip" -o wallet-api.zip
    if errorlevel 1 (
        echo   [ERROR] Download failed. Check internet connection.
        goto :download_error
    )

    :: Verify file exists and has reasonable size (should be > 1MB)
    for %%A in (wallet-api.zip) do set "FILESIZE=%%~zA"
    if !FILESIZE! LSS 1000000 (
        echo   [ERROR] Downloaded file is too small. File may be corrupt.
        del /f wallet-api.zip 2>nul
        goto :download_error
    )

    :: Extract
    echo   Extracting...
    tar -xf wallet-api.zip 2>nul
    if errorlevel 1 (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'wallet-api.zip' -DestinationPath '.' -Force" 2>nul
    )
    del wallet-api.zip 2>nul

    if exist wallet-api.exe (
        echo   [OK] wallet-api
    ) else (
        echo   [ERROR] wallet-api.exe not found after extraction
        goto :download_error
    )
) else (
    echo   [OK] wallet-api ^(already exists^)
)

if not exist "beam-wallet.exe" (
    echo   - beam-wallet...

    if exist beam-wallet.zip del /f beam-wallet.zip

    curl -L -f --retry 3 --retry-delay 2 --progress-bar "%GITHUB_BASE%/win-beam-wallet-cli-%BEAM_VERSION%.zip" -o beam-wallet.zip
    if errorlevel 1 (
        echo   [ERROR] Download failed. Check internet connection.
        goto :download_error
    )

    for %%A in (beam-wallet.zip) do set "FILESIZE=%%~zA"
    if !FILESIZE! LSS 1000000 (
        echo   [ERROR] Downloaded file is too small. File may be corrupt.
        del /f beam-wallet.zip 2>nul
        goto :download_error
    )

    echo   Extracting...
    tar -xf beam-wallet.zip 2>nul
    if errorlevel 1 (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'beam-wallet.zip' -DestinationPath '.' -Force" 2>nul
    )
    del beam-wallet.zip 2>nul

    if exist beam-wallet.exe (
        echo   [OK] beam-wallet
    ) else (
        echo   [ERROR] beam-wallet.exe not found after extraction
        goto :download_error
    )
) else (
    echo   [OK] beam-wallet ^(already exists^)
)

if not exist "beam-node.exe" (
    echo   - beam-node ^(optional^)...

    if exist beam-node.zip del /f beam-node.zip

    curl -L -f --retry 2 --progress-bar "%GITHUB_BASE%/win-beam-node-%BEAM_VERSION%.zip" -o beam-node.zip 2>nul
    if exist beam-node.zip (
        for %%A in (beam-node.zip) do set "FILESIZE=%%~zA"
        if !FILESIZE! GTR 1000000 (
            echo   Extracting...
            tar -xf beam-node.zip 2>nul
            if errorlevel 1 (
                powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'beam-node.zip' -DestinationPath '.' -Force" 2>nul
            )
        )
        del beam-node.zip 2>nul
        if exist beam-node.exe (
            echo   [OK] beam-node
        ) else (
            echo   [SKIP] beam-node ^(extraction failed, optional^)
        )
    ) else (
        echo   [SKIP] beam-node ^(optional^)
    )
) else (
    echo   [OK] beam-node ^(already exists^)
)

goto :download_done

:app_download_error
echo.
echo ======================================================================
echo   APPLICATION DOWNLOAD ERROR
echo ======================================================================
echo.
echo Failed to download wallet application from GitHub.
echo.
echo Manual installation:
echo   1. Go to: https://github.com/vsnation/Beam-Light-Wallet
echo   2. Click "Code" -^> "Download ZIP"
echo   3. Extract to: %INSTALL_DIR%
echo.
pause
exit /b 1

:download_error
echo.
echo ======================================================================
echo   BINARY DOWNLOAD ERROR
echo ======================================================================
echo.
echo Failed to download or extract BEAM binaries.
echo.
echo Manual download:
echo   - wallet-api: %GITHUB_BASE%/win-wallet-api-%BEAM_VERSION%.zip
echo   - beam-wallet: %GITHUB_BASE%/win-beam-wallet-cli-%BEAM_VERSION%.zip
echo.
echo Extract to: %BINARIES_DIR%
echo.
pause
exit /b 1

:download_done

cd /d "%INSTALL_DIR%"

:: ============================================================================
:: STEP 3: Create launcher scripts
:: ============================================================================
echo.
echo Creating launcher scripts...

:: Create start script
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
echo echo Data dir:   %%USERPROFILE%%\.beam-light-wallet
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
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%INSTALL_DIR%\start-wallet.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Description = 'BEAM Light Wallet - Privacy Wallet'; $s.Save()" 2>nul

echo.
echo ======================================================================
echo              Installation Complete!
echo ======================================================================
echo.
echo App code:     %INSTALL_DIR%
echo Private data: %DATA_DIR%
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
