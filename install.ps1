# BEAM Light Wallet - Windows Installer
# Run in PowerShell as Administrator (optional, for service install)

$ErrorActionPreference = "Stop"

Write-Host "======================================"
Write-Host "  BEAM Light Wallet Installer"
Write-Host "======================================"
Write-Host ""

# Configuration
$BEAM_VERSION = "7.5.13882"
$INSTALL_DIR = "$env:USERPROFILE\BEAM-LightWallet"
$PORT = 9080

Write-Host "Installing to: $INSTALL_DIR"
Write-Host ""

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
$GITHUB_BASE = "https://github.com/BeamMW/beam/releases/download/beam-$BEAM_VERSION"

Set-Location "binaries\windows"

# Download wallet-api
if (-not (Test-Path "wallet-api.exe")) {
    Write-Host "  - wallet-api..."
    Invoke-WebRequest -Uri "$GITHUB_BASE/windows-wallet-api-$BEAM_VERSION.zip" -OutFile "wallet-api.zip"
    Expand-Archive -Path "wallet-api.zip" -DestinationPath "." -Force
    Remove-Item "wallet-api.zip"
    # Handle nested tar if present
    if (Test-Path "wallet-api.tar") {
        tar -xf wallet-api.tar
        Remove-Item "wallet-api.tar"
    }
}

# Download beam-wallet
if (-not (Test-Path "beam-wallet.exe")) {
    Write-Host "  - beam-wallet..."
    Invoke-WebRequest -Uri "$GITHUB_BASE/windows-beam-wallet-cli-$BEAM_VERSION.zip" -OutFile "beam-wallet.zip"
    Expand-Archive -Path "beam-wallet.zip" -DestinationPath "." -Force
    Remove-Item "beam-wallet.zip"
    if (Test-Path "beam-wallet.tar") {
        tar -xf beam-wallet.tar
        Remove-Item "beam-wallet.tar"
    }
}

# Download beam-node (optional)
if (-not (Test-Path "beam-node.exe")) {
    Write-Host "  - beam-node (optional)..."
    try {
        Invoke-WebRequest -Uri "$GITHUB_BASE/windows-beam-node-$BEAM_VERSION.zip" -OutFile "beam-node.zip"
        Expand-Archive -Path "beam-node.zip" -DestinationPath "." -Force
        Remove-Item "beam-node.zip"
        if (Test-Path "beam-node.tar") {
            tar -xf beam-node.tar
            Remove-Item "beam-node.tar"
        }
    } catch {
        Write-Host "    (beam-node download failed, optional)" -ForegroundColor Yellow
    }
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
