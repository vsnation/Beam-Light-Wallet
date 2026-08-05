# BEAM Light Wallet - Windows Installer
# Run in PowerShell as Administrator (optional, for service install)

$ErrorActionPreference = "Stop"

Write-Host "======================================"
Write-Host "  BEAM Light Wallet Installer"
Write-Host "======================================"
Write-Host ""

# Configuration
$INSTALL_DIR = "$env:USERPROFILE\BEAM-LightWallet"
$PORT = 9080

# Versions, asset names and checksums come from config/binaries.json.
# Nothing about a BEAM release is written down anywhere else.
$manifestPath = $null
foreach ($candidate in @("$PSScriptRoot\config\binaries.json",
                         "$(Get-Location)\config\binaries.json",
                         "$INSTALL_DIR\config\binaries.json")) {
    if ($candidate -and (Test-Path $candidate)) { $manifestPath = $candidate; break }
}
if (-not $manifestPath) {
    Write-Host "Error: config\binaries.json not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Run this installer from a checkout of the wallet repository, so it can read"
    Write-Host "the pinned BEAM version, release asset names and SHA-256 checksums."
    exit 1
}

$MANIFEST = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$PLATFORM = $MANIFEST.platforms.windows
if (-not $PLATFORM) {
    Write-Host "Error: config\binaries.json has no 'windows' platform entry." -ForegroundColor Red
    exit 1
}
$BEAM_VERSION = $PLATFORM.beam_version

Write-Host "Installing to: $INSTALL_DIR"
Write-Host "BEAM binaries: v$BEAM_VERSION (from $manifestPath)"
Write-Host ""

# A build older than the hard fork cannot follow mainnet past the fork height.
# It keeps reporting itself as synced while its view of the chain is frozen.
if ($PLATFORM.hf6_compatible -eq $false) {
    $fork = $MANIFEST.hardfork
    Write-Host "======================================" -ForegroundColor Yellow
    Write-Host "  WARNING: BEAM $BEAM_VERSION IS OUT OF CONSENSUS" -ForegroundColor Yellow
    Write-Host "======================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  These binaries stall at block $($fork.height) ($($fork.name), activated $($fork.activated))" -ForegroundColor Yellow
    Write-Host "  and cannot follow mainnet past it. $($fork.name) needs $($fork.min_beam_version) or newer." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Balances and transaction history will be STALE. Do not rely on them," -ForegroundColor Yellow
    Write-Host "  and do not treat a received payment as confirmed." -ForegroundColor Yellow
    if ($PLATFORM.unsupported_reason) {
        Write-Host ""
        Write-Host "  $($PLATFORM.unsupported_reason)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Release asset for a binary, straight from the manifest. Windows assets are
# prefixed "win-", not "windows-"; asking for the latter is a 404.
function Get-BeamAsset($name) {
    $asset = $PLATFORM.binaries.$name.asset
    if (-not $asset) {
        Write-Host "Error: config\binaries.json has no asset for '$name' on windows." -ForegroundColor Red
        exit 1
    }
    return $asset
}

# True when the file on disk is the build pinned in the manifest (or when there
# is nothing pinned to compare against).
function Test-BeamHash($name, $file) {
    $expected = $PLATFORM.binaries.$name.sha256
    if (-not $expected) { return $true }
    return ((Get-FileHash -Path $file -Algorithm SHA256).Hash -eq $expected.ToUpper())
}

# Verify an extracted binary against the hash pinned in the manifest. The pinned
# hash is authoritative: a checksum fetched alongside the download only proves
# the file arrived intact, not that upstream shipped what we expected.
function Assert-BeamHash($name, $file) {
    $expected = $PLATFORM.binaries.$name.sha256
    if (-not $expected) {
        Write-Host "    (no pinned sha256 for $name, skipping verification)" -ForegroundColor Yellow
        return
    }
    $actual = (Get-FileHash -Path $file -Algorithm SHA256).Hash
    if ($actual -ne $expected.ToUpper()) {
        Remove-Item $file -Force -ErrorAction SilentlyContinue
        Write-Host ""
        Write-Host "Error: $name failed SHA-256 verification. Aborting." -ForegroundColor Red
        Write-Host "  expected: $($expected.ToLower())"
        Write-Host "  actual:   $($actual.ToLower())"
        Write-Host "  The download was corrupt or the release asset was replaced."
        Write-Host "  The file has been deleted. Do not run it."
        exit 1
    }
    Write-Host "    sha256 verified"
}

# Check Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Python found: $pythonVersion"
} catch {
    Write-Host "Error: Python 3 is required but not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Download from: https://www.python.org/downloads/"
    Write-Host "Or install with: winget install Python.Python.3.11"
    exit 1
}

# Create install directory
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
Set-Location $INSTALL_DIR

# Create subdirectories
New-Item -ItemType Directory -Force -Path "binaries\windows" | Out-Null
New-Item -ItemType Directory -Force -Path "wallets" | Out-Null
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

Write-Host ""
Write-Host "Downloading wallet files..."

# Download source files from GitHub (simplified - in production would download release)
$GITHUB_BASE = "$($MANIFEST.release_base)/beam-$BEAM_VERSION"

Set-Location "binaries\windows"

# Drop binaries left over from an older pinned version so the downloads below
# replace them. Without this an existing install keeps its old build forever,
# which is how a machine ends up stranded on the wrong side of a hard fork.
foreach ($bin in @("wallet-api", "beam-wallet", "beam-node")) {
    if ((Test-Path "$bin.exe") -and -not (Test-BeamHash $bin "$bin.exe")) {
        Write-Host "  - $bin is not the pinned v$BEAM_VERSION build, replacing it" -ForegroundColor Yellow
        Remove-Item "$bin.exe" -Force
    }
}

# Download wallet-api
if (-not (Test-Path "wallet-api.exe")) {
    Write-Host "  - wallet-api..."
    Invoke-WebRequest -Uri "$GITHUB_BASE/$(Get-BeamAsset 'wallet-api')" -OutFile "wallet-api.zip"
    Expand-Archive -Path "wallet-api.zip" -DestinationPath "." -Force
    Remove-Item "wallet-api.zip"
    # Handle nested tar if present
    if (Test-Path "wallet-api.tar") {
        tar -xf wallet-api.tar
        Remove-Item "wallet-api.tar"
    }
    if (Test-Path "wallet-api.exe") { Assert-BeamHash "wallet-api" "wallet-api.exe" }
}

# Download beam-wallet
if (-not (Test-Path "beam-wallet.exe")) {
    Write-Host "  - beam-wallet..."
    Invoke-WebRequest -Uri "$GITHUB_BASE/$(Get-BeamAsset 'beam-wallet')" -OutFile "beam-wallet.zip"
    Expand-Archive -Path "beam-wallet.zip" -DestinationPath "." -Force
    Remove-Item "beam-wallet.zip"
    if (Test-Path "beam-wallet.tar") {
        tar -xf beam-wallet.tar
        Remove-Item "beam-wallet.tar"
    }
    if (Test-Path "beam-wallet.exe") { Assert-BeamHash "beam-wallet" "beam-wallet.exe" }
}

# Download beam-node (optional)
if (-not (Test-Path "beam-node.exe")) {
    Write-Host "  - beam-node (optional)..."
    try {
        Invoke-WebRequest -Uri "$GITHUB_BASE/$(Get-BeamAsset 'beam-node')" -OutFile "beam-node.zip"
        Expand-Archive -Path "beam-node.zip" -DestinationPath "." -Force
        Remove-Item "beam-node.zip"
        if (Test-Path "beam-node.tar") {
            tar -xf beam-node.tar
            Remove-Item "beam-node.tar"
        }
    } catch {
        Write-Host "    (beam-node download failed, optional)" -ForegroundColor Yellow
    }
    # Outside the catch: a hash mismatch must abort, not be swallowed as
    # "optional download failed".
    if (Test-Path "beam-node.exe") { Assert-BeamHash "beam-node" "beam-node.exe" }
}

Set-Location $INSTALL_DIR

# Create start script
@"
@echo off
cd /d "%~dp0"
echo Starting BEAM Light Wallet...
echo Open http://127.0.0.1:$PORT in your browser
echo.
python serve.py $PORT
"@ | Out-File -FilePath "start.bat" -Encoding ASCII

# Create stop script
@"
@echo off
taskkill /F /IM python.exe /FI "WINDOWTITLE eq *serve.py*" 2>nul
echo BEAM Light Wallet stopped
"@ | Out-File -FilePath "stop.bat" -Encoding ASCII

Write-Host ""
Write-Host "======================================"
Write-Host "  Installation Complete!"
Write-Host "======================================"
Write-Host ""
Write-Host "To start the wallet:"
Write-Host "  cd $INSTALL_DIR"
Write-Host "  .\start.bat"
Write-Host ""
Write-Host "Or run directly:"
Write-Host "  python $INSTALL_DIR\serve.py $PORT"
Write-Host ""
Write-Host "Then open: http://127.0.0.1:$PORT"
Write-Host ""

# Ask to start now
$response = Read-Host "Start the wallet now? [Y/n]"
if ($response -eq "" -or $response -eq "Y" -or $response -eq "y") {
    Write-Host ""
    Write-Host "Starting wallet..."

    # Open browser after delay
    Start-Job -ScriptBlock {
        Start-Sleep -Seconds 3
        Start-Process "http://127.0.0.1:9080"
    } | Out-Null

    # Start server
    python serve.py $PORT
}
