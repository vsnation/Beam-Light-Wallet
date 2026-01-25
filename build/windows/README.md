# BEAM Light Wallet - Windows Installer

**Developed by @vsnation**

**Donations:** `e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048`

---

## Quick Install (For Users)

### Option 1: One-Click Batch File
1. Download `install-beam-wallet.bat`
2. Double-click to run
3. Follow the prompts

### Option 2: PowerShell Installer
1. Right-click `BEAM-LightWallet-Setup.ps1`
2. Select "Run with PowerShell"
3. If blocked, run: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass`

---

## Building EXE Installer (For Developers)

### Method 1: PS2EXE (Simple)

Convert PowerShell script to standalone .exe:

```powershell
# Install ps2exe module
Install-Module ps2exe -Scope CurrentUser

# Convert to EXE
Invoke-PS2EXE -InputFile .\BEAM-LightWallet-Setup.ps1 -OutputFile .\BEAM-LightWallet-Setup.exe -NoConsole -Title "BEAM Light Wallet Setup" -Version "1.0.0" -Company "BEAM Community"
```

### Method 2: Inno Setup (Professional)

For a full Windows installer with uninstall support:

1. Download Inno Setup: https://jrsoftware.org/isinfo.php
2. Open `beam-wallet-inno.iss` in Inno Setup
3. Click Build > Compile
4. Output: `BEAM-LightWallet-Setup.exe`

### Method 3: NSIS (Advanced)

1. Download NSIS: https://nsis.sourceforge.io/
2. Use the NSIS script `beam-wallet.nsi`
3. Compile with `makensis beam-wallet.nsi`

---

## Files Included

| File | Description |
|------|-------------|
| `install-beam-wallet.bat` | Simple batch installer (double-click) |
| `BEAM-LightWallet-Setup.ps1` | PowerShell installer (more features) |
| `beam-wallet-inno.iss` | Inno Setup script (professional installer) |
| `README.md` | This file |

---

## What Gets Installed

```
%USERPROFILE%\BEAM-LightWallet\
├── binaries\windows\
│   ├── wallet-api.exe      # Wallet API server
│   ├── beam-wallet.exe     # CLI wallet
│   └── beam-node.exe       # Local node (optional)
├── wallets\                 # Wallet databases
├── logs\                    # Log files
├── src\                     # Web UI files
├── serve.py                 # Python web server
├── Start-Wallet.bat         # Launcher
└── Stop-Wallet.bat          # Stop script
```

---

## Requirements

- Windows 10 or later
- Python 3.8+ (with PATH configured)
- ~200MB disk space
- Internet connection (for binary download)

---

## Troubleshooting

### "Python not found"
1. Download Python from https://www.python.org/downloads/
2. **Important**: Check "Add Python to PATH" during installation
3. Restart the installer

### "Script blocked by execution policy"
Run in PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass
```

### "Firewall blocking connections"
The wallet only binds to localhost (127.0.0.1) by default.
No firewall changes needed for local use.

### "Antivirus blocking download"
Some antivirus may flag the BEAM binaries. They are safe - you can:
1. Add exception for `%USERPROFILE%\BEAM-LightWallet`
2. Or download manually from https://github.com/BeamMW/beam/releases
