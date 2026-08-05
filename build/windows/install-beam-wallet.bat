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
:: BEAM_VERSION, GITHUB_BASE, release asset names and SHA-256 checksums are read
:: from config\binaries.json in STEP 2, once the wallet application is unpacked.
:: That file is the single source of truth; nothing is hardcoded here.
set "PORT=9080"
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

:: Check if wallet is FULLY installed (serve.py, src\index.html AND the version
:: manifest must all exist). config\binaries.json is part of the test because an
:: install made before the manifest existed would otherwise skip this download,
:: then die in STEP 2 with no way out - re-running would skip the download again.
if exist "serve.py" (
    if exist "src\index.html" (
        if exist "config\binaries.json" (
            echo   [OK] Wallet application already installed
            goto :app_installed
        )
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
:: STEP 2: Read config\binaries.json (single source of truth for versions)
:: ============================================================================
echo.
echo Reading version manifest...
set "MANIFEST=%INSTALL_DIR%\config\binaries.json"
if not exist "%MANIFEST%" goto :manifest_error

:: Clear first: every one of these must come from the manifest. Inheriting e.g.
:: BEAM_VERSION from the caller's environment would let a failed read look like a
:: successful one and send the download at whatever version happened to be set.
for %%V in (BEAM_VERSION RELEASE_BASE HF6_COMPATIBLE FORK_NAME FORK_HEIGHT FORK_MIN_VERSION ASSET_WALLET_API ASSET_BEAM_WALLET ASSET_BEAM_NODE SHA_WALLET_API SHA_BEAM_WALLET SHA_BEAM_NODE) do set "%%V="

:: Keys with a null value are not emitted at all. "SHA_X=" would give the for /f
:: no second token, and a KEY with no value must not end up carrying whatever the
:: parser leaves behind - a bogus expected hash would abort a good download.
for /f "usebackq tokens=1,* delims==" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$m = ConvertFrom-Json (Get-Content -Raw '%MANIFEST%'); $p = $m.platforms.windows; Write-Output ('BEAM_VERSION=' + $p.beam_version); Write-Output ('RELEASE_BASE=' + $m.release_base); Write-Output ('HF6_COMPATIBLE=' + $p.hf6_compatible); Write-Output ('FORK_NAME=' + $m.hardfork.name); Write-Output ('FORK_HEIGHT=' + $m.hardfork.height); Write-Output ('FORK_MIN_VERSION=' + $m.hardfork.min_beam_version); Write-Output ('ASSET_WALLET_API=' + $p.binaries.'wallet-api'.asset); Write-Output ('ASSET_BEAM_WALLET=' + $p.binaries.'beam-wallet'.asset); Write-Output ('ASSET_BEAM_NODE=' + $p.binaries.'beam-node'.asset); if ($p.binaries.'wallet-api'.sha256) { Write-Output ('SHA_WALLET_API=' + $p.binaries.'wallet-api'.sha256) }; if ($p.binaries.'beam-wallet'.sha256) { Write-Output ('SHA_BEAM_WALLET=' + $p.binaries.'beam-wallet'.sha256) }; if ($p.binaries.'beam-node'.sha256) { Write-Output ('SHA_BEAM_NODE=' + $p.binaries.'beam-node'.sha256) }"`) do set "%%A=%%B"

if not defined BEAM_VERSION goto :manifest_error
if not defined RELEASE_BASE goto :manifest_error
if not defined ASSET_WALLET_API goto :manifest_error
if not defined ASSET_BEAM_WALLET goto :manifest_error

:: Release assets are named "win-...", NOT "windows-...". Taking the names from
:: the manifest is what keeps that from drifting back into a 404.
set "GITHUB_BASE=%RELEASE_BASE%/beam-%BEAM_VERSION%"
echo   [OK] BEAM %BEAM_VERSION%

:: A build older than the hard fork cannot follow mainnet past the fork height.
:: It keeps reporting itself as synced while its view of the chain is frozen.
if /i "%HF6_COMPATIBLE%"=="False" (
    echo.
    echo ======================================================================
    echo   WARNING: BEAM %BEAM_VERSION% IS OUT OF CONSENSUS
    echo ======================================================================
    echo.
    echo These binaries stall at block %FORK_HEIGHT% ^(%FORK_NAME%^) and cannot follow
    echo mainnet past it. %FORK_NAME% requires BEAM %FORK_MIN_VERSION% or newer.
    echo.
    echo Balances and transaction history will be STALE. Do not rely on them,
    echo and do not treat a received payment as confirmed.
    echo.
    pause
)

:: ============================================================================
:: STEP 3: Download BEAM binaries to ~/.beam-light-wallet/binaries/windows/
:: ============================================================================
echo.
echo Downloading BEAM binaries v%BEAM_VERSION%...
echo   Target: %BINARIES_DIR%
cd /d "%BINARIES_DIR%"

:: Drop binaries left over from an older pinned version. verify_hash deletes
:: anything that does not match, so the downloads below fetch the pinned build.
:: Without this an existing install keeps its old binaries forever, which is how
:: a machine ends up stranded on the wrong side of a hard fork.
echo   Checking existing binaries...
call :verify_hash "wallet-api.exe" "!SHA_WALLET_API!" >nul 2>&1
call :verify_hash "beam-wallet.exe" "!SHA_BEAM_WALLET!" >nul 2>&1
call :verify_hash "beam-node.exe" "!SHA_BEAM_NODE!" >nul 2>&1

if not exist "wallet-api.exe" (
    echo   - wallet-api...

    :: Delete any existing corrupt file
    if exist wallet-api.zip del /f wallet-api.zip

    :: Download with retry
    curl -L -f --retry 3 --retry-delay 2 --progress-bar "%GITHUB_BASE%/!ASSET_WALLET_API!" -o wallet-api.zip
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

    :: Verify against the hash pinned in config\binaries.json. The pinned hash is
    :: authoritative: the *-checksum.txt shipped next to the download only proves
    :: the file arrived intact, not that upstream shipped what we expected.
    call :verify_hash "wallet-api.exe" "!SHA_WALLET_API!"
    if errorlevel 1 goto :hash_error

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

    curl -L -f --retry 3 --retry-delay 2 --progress-bar "%GITHUB_BASE%/!ASSET_BEAM_WALLET!" -o beam-wallet.zip
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

    call :verify_hash "beam-wallet.exe" "!SHA_BEAM_WALLET!"
    if errorlevel 1 goto :hash_error

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

    curl -L -f --retry 2 --progress-bar "%GITHUB_BASE%/!ASSET_BEAM_NODE!" -o beam-node.zip 2>nul
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
        call :verify_hash "beam-node.exe" "!SHA_BEAM_NODE!"
        if errorlevel 1 goto :hash_error
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

:manifest_error
echo.
echo ======================================================================
echo   VERSION MANIFEST ERROR
echo ======================================================================
echo.
echo Could not read: %INSTALL_DIR%\config\binaries.json
echo.
echo That file pins the BEAM version, the release asset names and their
echo SHA-256 checksums. Without it this installer does not know what to
echo download, and will not guess.
echo.
echo Re-run the installer, or download the wallet manually:
echo   https://github.com/vsnation/Beam-Light-Wallet
echo.
pause
exit /b 1

:hash_error
echo.
echo ======================================================================
echo   CHECKSUM VERIFICATION FAILED
echo ======================================================================
echo.
echo A downloaded binary did not match the SHA-256 pinned in
echo config\binaries.json. Either the download was corrupt, or the release
echo asset was replaced upstream.
echo.
echo The file has been deleted. Do not run it.
echo Re-run this installer to try again.
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
echo   - wallet-api: %GITHUB_BASE%/%ASSET_WALLET_API%
echo   - beam-wallet: %GITHUB_BASE%/%ASSET_BEAM_WALLET%
echo.
echo Extract to: %BINARIES_DIR%
echo.
pause
exit /b 1

:download_done

cd /d "%INSTALL_DIR%"

:: ============================================================================
:: STEP 4: Create launcher scripts
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
exit /b 0

:: ============================================================================
:: Subroutines
:: ============================================================================

:: verify_hash <file> <expected sha256>
:: Returns 1 if the file exists and does not match the pinned hash, and deletes
:: it. Returns 0 when there is nothing to check (file absent, or no pinned hash).
:verify_hash
set "EXPECTED=%~2"
if not exist "%~1" exit /b 0
if "%EXPECTED%"=="" (
    echo   [SKIP] no pinned sha256 for %~1
    exit /b 0
)
set "ACTUAL="
for /f "usebackq delims=" %%H in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-FileHash -Algorithm SHA256 '%~1').Hash"`) do set "ACTUAL=%%H"
if "%ACTUAL%"=="" (
    echo.
    echo   [ERROR] Could not compute SHA-256 for %~1 ^(is powershell available?^)
    exit /b 1
)
if /i not "%ACTUAL%"=="%EXPECTED%" (
    echo.
    echo   [ERROR] %~1 failed SHA-256 verification
    echo     expected: %EXPECTED%
    echo     actual:   %ACTUAL%
    del /f "%~1" 2>nul
    exit /b 1
)
echo   [OK] %~1 sha256 verified
exit /b 0
