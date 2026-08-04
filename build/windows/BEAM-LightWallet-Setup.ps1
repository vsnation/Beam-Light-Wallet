#Requires -Version 5.1
<#
.SYNOPSIS
    BEAM Light Wallet - Windows Installer
.DESCRIPTION
    One-click installer for BEAM Light Wallet on Windows.
    Downloads binaries, sets up directories, creates shortcuts.
.NOTES
    To convert to .exe: Install-Module ps2exe; Invoke-PS2EXE .\Beam-Light-Wallet-Setup.ps1 .\Beam-Light-Wallet-Setup.exe
#>

param(
    [string]$InstallDir = "$env:USERPROFILE\Beam-Light-Wallet",
    [int]$Port = 9080,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Faster downloads

# Configuration - versions, asset names and checksums live in config/binaries.json
$manifestPath = $null
# $InstallDir is searched last on purpose: it holds the manifest of whatever was
# installed before, and preferring that over the one shipped with this installer
# would pin the machine to the old build forever.
foreach ($candidate in @("$PSScriptRoot\config\binaries.json",
                         "$PSScriptRoot\..\..\config\binaries.json",
                         "$(Get-Location)\config\binaries.json",
                         "$InstallDir\config\binaries.json")) {
    if ($candidate -and (Test-Path $candidate)) { $manifestPath = (Resolve-Path $candidate).Path; break }
}
if (-not $manifestPath) {
    Write-Host "[!] config\binaries.json not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "  This installer reads the pinned BEAM version, release asset names and" -ForegroundColor Yellow
    Write-Host "  SHA-256 checksums from config\binaries.json. Run it from a checkout of" -ForegroundColor Yellow
    Write-Host "  the wallet repository, or place config\binaries.json next to this script." -ForegroundColor Yellow
    Write-Host ""
    if (-not $Silent) { Read-Host "Press Enter to exit" }
    exit 1
}

$MANIFEST = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$PLATFORM = $MANIFEST.platforms.windows
if (-not $PLATFORM) {
    Write-Host "[!] config\binaries.json has no 'windows' platform entry." -ForegroundColor Red
    if (-not $Silent) { Read-Host "Press Enter to exit" }
    exit 1
}
$BEAM_VERSION = $PLATFORM.beam_version
$GITHUB_BASE = "$($MANIFEST.release_base)/beam-$BEAM_VERSION"

# Colors for console output
function Write-Status($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Error($msg) { Write-Host "[!] $msg" -ForegroundColor Red }
function Write-Warning($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }

# Release asset for a binary, straight from the manifest. Windows assets are
# prefixed "win-", not "windows-"; asking for the latter is a 404.
function Get-BeamAsset($name) {
    $asset = $PLATFORM.binaries.$name.asset
    if (-not $asset) { throw "config\binaries.json has no asset for '$name' on windows" }
    return $asset
}

# Name of the executable inside the archive, per the manifest.
function Get-BeamFile($name) {
    $file = $PLATFORM.binaries.$name.file
    if ($file) { return $file }
    return "$name.exe"
}

# True when the file on disk is the build pinned in the manifest (or when there
# is nothing pinned to compare against).
function Test-BeamHash($name, $path) {
    $expected = $PLATFORM.binaries.$name.sha256
    if (-not $expected) { return $true }
    return ((Get-FileHash -Path $path -Algorithm SHA256).Hash -eq $expected.ToUpper())
}

# Verify an extracted binary against the hash pinned in the manifest. The pinned
# hash is authoritative: the *-checksum.txt shipped next to the download only
# proves the file arrived intact, not that upstream shipped what we expected.
function Assert-BeamHash($name, $path) {
    $expected = $PLATFORM.binaries.$name.sha256
    if (-not $expected) {
        Write-Warning "No pinned sha256 for $name, skipping verification"
        return
    }
    $actual = (Get-FileHash -Path $path -Algorithm SHA256).Hash
    if ($actual -ne $expected.ToUpper()) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "[!] $name failed SHA-256 verification. Aborting install." -ForegroundColor Red
        Write-Host "    expected: $($expected.ToLower())" -ForegroundColor Red
        Write-Host "    actual:   $($actual.ToLower())" -ForegroundColor Red
        Write-Host "    The download was corrupt or the release asset was replaced." -ForegroundColor Red
        Write-Host "    The file has been deleted. Do not run it." -ForegroundColor Red
        Write-Host ""
        if (-not $Silent) { Read-Host "Press Enter to exit" }
        exit 1
    }
    Write-Success "$name sha256 verified"
}

# Show banner
Clear-Host
Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "         BEAM Light Wallet - Windows Installer" -ForegroundColor White
Write-Host "         Developed by @vsnation" -ForegroundColor Gray
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Version: $BEAM_VERSION"
Write-Host "  Install to: $InstallDir"
Write-Host ""
Write-Host "  Donations: " -NoNewline -ForegroundColor Gray
Write-Host "e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048" -ForegroundColor Yellow
Write-Host ""

# A build older than the hard fork cannot follow mainnet past the fork height.
# It keeps reporting itself as synced while its view of the chain is frozen.
if ($PLATFORM.hf6_compatible -eq $false) {
    $fork = $MANIFEST.hardfork
    Write-Host "  ======================================================" -ForegroundColor Yellow
    Write-Host "     WARNING: BEAM $BEAM_VERSION IS OUT OF CONSENSUS" -ForegroundColor Yellow
    Write-Host "  ======================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  These binaries stall at block $($fork.height) ($($fork.name), activated" -ForegroundColor Yellow
    Write-Host "  $($fork.activated)) and cannot follow mainnet past it." -ForegroundColor Yellow
    Write-Host "  $($fork.name) requires BEAM $($fork.min_beam_version) or newer." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Balances and transaction history will be STALE. Do not rely on them," -ForegroundColor Yellow
    Write-Host "  and do not treat a received payment as confirmed." -ForegroundColor Yellow
    if ($PLATFORM.unsupported_reason) {
        Write-Host ""
        Write-Host "  $($PLATFORM.unsupported_reason)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Check Python
Write-Status "Checking Python installation..."
try {
    $pythonVersion = python --version 2>&1
    Write-Success "Python found: $pythonVersion"
} catch {
    Write-Error "Python 3 is required but not installed."
    Write-Host ""
    Write-Host "  Please install Python from: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  Or run: winget install Python.Python.3.11" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  IMPORTANT: Check 'Add Python to PATH' during installation!" -ForegroundColor Red
    Write-Host ""
    if (-not $Silent) { Read-Host "Press Enter to exit" }
    exit 1
}

# Create directories
Write-Status "Creating directories..."
$dirs = @(
    $InstallDir,
    "$InstallDir\binaries\windows",
    "$InstallDir\wallets",
    "$InstallDir\logs",
    "$InstallDir\src",
    "$InstallDir\src\js",
    "$InstallDir\src\css",
    "$InstallDir\shaders",
    "$InstallDir\config"
)
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
Write-Success "Directories created"

# Download function
function Download-Binary($name, $filename, $url) {
    $targetPath = "$InstallDir\binaries\windows\$filename"
    if (Test-Path $targetPath) {
        # An existing binary from an older pinned version has to go, or this
        # machine keeps running the old build forever.
        if (Test-BeamHash $name $targetPath) {
            Write-Success "$name already exists"
            return
        }
        Write-Warning "$name is not the pinned v$BEAM_VERSION build, replacing it"
        Remove-Item $targetPath -Force
    }

    Write-Status "Downloading $name..."
    $zipPath = "$InstallDir\binaries\windows\$name.zip"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

        Write-Status "Extracting $name..."
        Expand-Archive -Path $zipPath -DestinationPath "$InstallDir\binaries\windows" -Force

        # Handle nested tar
        $tarPath = "$InstallDir\binaries\windows\$name.tar"
        if (Test-Path $tarPath) {
            Set-Location "$InstallDir\binaries\windows"
            tar -xf "$name.tar" 2>$null
            Remove-Item "$name.tar" -Force
        }

        Remove-Item $zipPath -Force
        Write-Success "$name downloaded"
    } catch {
        Write-Warning "Failed to download $name`: $_"
    }

    # Outside the catch: a hash mismatch must abort the install, not be swallowed
    # as "download failed".
    if (Test-Path $targetPath) { Assert-BeamHash $name $targetPath }
}

# Download binaries
Write-Host ""
Write-Status "Downloading BEAM binaries v$BEAM_VERSION..."
Write-Host "  This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

Download-Binary "wallet-api" $(Get-BeamFile 'wallet-api') "$GITHUB_BASE/$(Get-BeamAsset 'wallet-api')"
Download-Binary "beam-wallet" $(Get-BeamFile 'beam-wallet') "$GITHUB_BASE/$(Get-BeamAsset 'beam-wallet')"
Download-Binary "beam-node" $(Get-BeamFile 'beam-node') "$GITHUB_BASE/$(Get-BeamAsset 'beam-node')"

# Create start script
Write-Host ""
Write-Status "Creating launcher scripts..."

$startScript = @"
@echo off
cd /d "%~dp0"
title BEAM Light Wallet
echo.
echo   BEAM Light Wallet
echo   =================
echo.
echo   Starting server on http://127.0.0.1:$Port
echo   Press Ctrl+C to stop
echo.
start "" "http://127.0.0.1:$Port"
python serve.py $Port
"@
Set-Content -Path "$InstallDir\Start-Wallet.bat" -Value $startScript

$stopScript = @"
@echo off
echo Stopping BEAM Light Wallet...
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *BEAM Light Wallet*" 2>nul
taskkill /F /IM wallet-api.exe 2>nul
taskkill /F /IM beam-node.exe 2>nul
echo Done.
"@
Set-Content -Path "$InstallDir\Stop-Wallet.bat" -Value $stopScript

Write-Success "Scripts created"

# Create desktop shortcut
Write-Status "Creating desktop shortcut..."
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\BEAM Light Wallet.lnk")
    $Shortcut.TargetPath = "$InstallDir\Start-Wallet.bat"
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description = "BEAM Light Wallet - Privacy-focused cryptocurrency wallet"
    $Shortcut.Save()
    Write-Success "Desktop shortcut created"
} catch {
    Write-Warning "Could not create desktop shortcut: $_"
}

# Create Start Menu shortcut
Write-Status "Creating Start Menu entry..."
try {
    $startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
    $Shortcut = $WshShell.CreateShortcut("$startMenuPath\BEAM Light Wallet.lnk")
    $Shortcut.TargetPath = "$InstallDir\Start-Wallet.bat"
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description = "BEAM Light Wallet"
    $Shortcut.Save()
    Write-Success "Start Menu entry created"
} catch {
    Write-Warning "Could not create Start Menu entry"
}

# Summary
Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "         Installation Complete!" -ForegroundColor White
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Install location: $InstallDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  To start the wallet:" -ForegroundColor White
Write-Host "    - Double-click 'BEAM Light Wallet' on Desktop" -ForegroundColor Gray
Write-Host "    - Or search 'BEAM Light Wallet' in Start Menu" -ForegroundColor Gray
Write-Host ""
Write-Host "  Web interface: http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host ""

# Note about serve.py
if (-not (Test-Path "$InstallDir\serve.py")) {
    Write-Warning "serve.py not found!"
    Write-Host ""
    Write-Host "  Please download the wallet files from:" -ForegroundColor Yellow
    Write-Host "  https://github.com/user/Beam-Light-Wallet/releases" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  And extract to: $InstallDir" -ForegroundColor Gray
}

# Ask to start
if (-not $Silent) {
    Write-Host ""
    $response = Read-Host "Start the wallet now? (Y/N)"
    if ($response -eq "Y" -or $response -eq "y") {
        Write-Host ""
        Write-Status "Starting wallet..."
        Start-Process "$InstallDir\Start-Wallet.bat"
    }
}

Write-Host ""
Write-Host "  Thank you for using BEAM Light Wallet!" -ForegroundColor Cyan
Write-Host ""
