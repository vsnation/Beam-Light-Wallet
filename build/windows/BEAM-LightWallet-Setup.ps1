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

# Configuration
$BEAM_VERSION = "7.5.13882"
$GITHUB_BASE = "https://github.com/BeamMW/beam/releases/download/beam-$BEAM_VERSION"

# Colors for console output
function Write-Status($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Error($msg) { Write-Host "[!] $msg" -ForegroundColor Red }
function Write-Warning($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }

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
        Write-Success "$name already exists"
        return
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
}

# Download binaries
Write-Host ""
Write-Status "Downloading BEAM binaries v$BEAM_VERSION..."
Write-Host "  This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

Download-Binary "wallet-api" "wallet-api.exe" "$GITHUB_BASE/windows-wallet-api-$BEAM_VERSION.zip"
Download-Binary "beam-wallet" "beam-wallet.exe" "$GITHUB_BASE/windows-beam-wallet-cli-$BEAM_VERSION.zip"
Download-Binary "beam-node" "beam-node.exe" "$GITHUB_BASE/windows-beam-node-$BEAM_VERSION.zip"

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
