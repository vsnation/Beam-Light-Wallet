# BEAM Light Wallet

<p align="center">
  <img src="build/AppIcon.svg" width="128" height="128" alt="BEAM Light Wallet">
</p>

<p align="center">
  <strong>The First and Only Fully Decentralized Light Wallet for BEAM Privacy Blockchain</strong>
</p>

<p align="center">
  <a href="#quick-install">Quick Install</a> •
  <a href="#features">Features</a> •
  <a href="#manual-installation">Manual Install</a> •
  <a href="#usage">Usage</a> •
  <a href="#donate">Donate</a>
</p>

---

**Developed by [@vsnation](https://github.com/vsnation)**

**Donations:** `e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048`

---

## Quick Install

### 🍎 macOS

```bash
git clone https://github.com/vsnation/Beam-Light-Wallet.git
cd Beam-Light-Wallet
./install.sh
```

Or download DMG from [Releases](https://github.com/vsnation/Beam-Light-Wallet/releases).

### 🐧 Linux (Ubuntu/Debian)

```bash
git clone https://github.com/vsnation/Beam-Light-Wallet.git
cd Beam-Light-Wallet
./install.sh
```

Or one-liner:
```bash
curl -fsSL https://raw.githubusercontent.com/vsnation/Beam-Light-Wallet/main/install.sh | bash
```

### 🪟 Windows

```powershell
git clone https://github.com/vsnation/Beam-Light-Wallet.git
cd Beam-Light-Wallet
.\build\windows\install.bat
```

Or download from [Releases](https://github.com/vsnation/Beam-Light-Wallet/releases).

---

## Features

- **🚀 One-Click Launch** - Downloads binaries automatically, starts in seconds
- **🔒 Fully Decentralized** - No backend servers, direct blockchain connection
- **👛 Multi-Wallet Support** - Create and manage multiple wallets
- **🔐 Full Privacy** - MimbleWimble + Confidential Transactions + Dandelion++
- **💸 Send & Receive** - BEAM and all Confidential Assets
- **📈 DEX Trading** - Built-in Uniswap-style AMM DEX
- **📱 Mobile Access** - Access from any device on your network
- **🎨 Beautiful UI** - Modern dark theme, intuitive design

---

## Manual Installation

### 1. Clone Repository

```bash
git clone https://github.com/vsnation/Beam-Light-Wallet.git
cd Beam-Light-Wallet
```

### 2. Download BEAM Binaries

**macOS:**
```bash
mkdir -p binaries/macos && cd binaries/macos
curl -LO https://github.com/BeamMW/beam/releases/download/beam-7.5.13882/mac-wallet-api-7.5.13882.tar.gz
curl -LO https://github.com/BeamMW/beam/releases/download/beam-7.5.13882/mac-beam-wallet-cli-7.5.13882.tar.gz
tar -xzf *.tar.gz && chmod +x wallet-api beam-wallet
cd ../..
```

**Linux:**
```bash
mkdir -p binaries/linux && cd binaries/linux
curl -LO https://github.com/BeamMW/beam/releases/download/beam-7.5.13882/linux-wallet-api-7.5.13882.tar.gz
curl -LO https://github.com/BeamMW/beam/releases/download/beam-7.5.13882/linux-beam-wallet-cli-7.5.13882.tar.gz
tar -xzf *.tar.gz && chmod +x wallet-api beam-wallet
cd ../..
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "binaries\windows"
cd binaries\windows
Invoke-WebRequest -Uri "https://github.com/BeamMW/beam/releases/download/beam-7.5.13882/windows-wallet-api-7.5.13882.zip" -OutFile "wallet-api.zip"
Invoke-WebRequest -Uri "https://github.com/BeamMW/beam/releases/download/beam-7.5.13882/windows-beam-wallet-cli-7.5.13882.zip" -OutFile "beam-wallet.zip"
Expand-Archive -Path "*.zip" -DestinationPath "." -Force
cd ..\..
```

### 3. Start the Wallet

```bash
python3 serve.py 8080
```

### 4. Open in Browser

```
http://127.0.0.1:8080
```

---

## Usage

### Create a New Wallet

1. Click **"Create New"**
2. Enter wallet name and password
3. **WRITE DOWN** your 12-word seed phrase
4. Confirm and start using your wallet

### Restore a Wallet

1. Click **"Restore"**
2. Enter your 12-word seed phrase
3. Set a new password
4. Wallet will sync automatically

### Send BEAM

1. Go to **Send** tab
2. Enter recipient address and amount
3. Click **Send** and confirm

### DEX Trading

1. Go to **DEX** tab
2. Select tokens to swap
3. Enter amount (quote updates automatically)
4. Click **Swap** to execute

---

## Project Structure

```
Beam-Light-Wallet/
├── serve.py                # Main HTTP server
├── install.sh              # Cross-platform installer
├── src/                    # Web interface
│   ├── index.html          # Main application
│   ├── css/                # Stylesheets
│   └── js/                 # JavaScript
├── config/                 # Configuration files
├── binaries/               # BEAM binaries (gitignored)
│   ├── linux/
│   ├── macos/
│   └── windows/
├── wallets/                # Wallet databases (gitignored)
├── logs/                   # Log files (gitignored)
├── build/                  # Build scripts
│   ├── create-dmg.sh       # macOS DMG builder
│   ├── linux/              # Linux installers
│   └── windows/            # Windows installers
└── tests/                  # Test scripts
```

---

## Security

- **No Backend Servers** - All data stored locally
- **Password Encrypted** - Wallets protected with user password
- **12-Word Seed Phrase** - Standard BIP39 recovery
- **Local API Only** - wallet-api binds to 127.0.0.1
- **Auto-Lock** - Configurable timeout

### ⚠️ Important

- **NEVER** share your seed phrase with anyone
- **NEVER** expose port 9080 to the internet without authentication
- **ALWAYS** backup your seed phrase in multiple secure locations

---

## Configuration

### Public Nodes

| Region | Address |
|--------|---------|
| EU | `eu-node01.mainnet.beam.mw:8100` |
| EU | `eu-node02.mainnet.beam.mw:8100` |
| US | `us-node01.mainnet.beam.mw:8100` |
| US | `us-node02.mainnet.beam.mw:8100` |
| Asia | `ap-node01.mainnet.beam.mw:8100` |

### Ports

| Service | Port | Description |
|---------|------|-------------|
| Web UI | 8080 | Wallet web interface |
| wallet-api | 10000 | JSON-RPC API |
| beam-node | 10005 | Local node (optional) |

---

## Remote Access

### SSH Tunnel (Recommended)

```bash
# From your remote machine
ssh -L 8080:127.0.0.1:8080 user@your-server

# Then open in browser
http://127.0.0.1:8080
```

### Tailscale VPN

1. Install Tailscale on your server and device
2. Access via Tailscale IP: `http://100.x.x.x:8080`

---

## Troubleshooting

### Wallet won't start

```bash
# Check if port is in use
lsof -i :8080

# Kill existing process
pkill -f serve.py
```

### Balance shows zero after restore

- Wait for blockchain sync to complete
- Go to Settings → Rescan if needed

### DEX not working

DEX requires local node with shader support. Public nodes don't support DEX operations.

---

## Development

### Running Tests

```bash
./tests/test_launch.sh
```

### Building macOS DMG

```bash
./build/create-dmg.sh
```

---

## Version

- **Wallet Version:** 1.0.0
- **BEAM Binaries:** 7.5.13882

---

## Donate

If you find this wallet useful, please consider donating:

**BEAM Address:**
```
e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
```

---

## License

MIT License - See [LICENSE](LICENSE)

---

## Links

- [BEAM Website](https://beam.mw)
- [BEAM GitHub](https://github.com/BeamMW)
- [BEAM Explorer](https://explorer.beam.mw)
- [Developer: @vsnation](https://github.com/vsnation)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/vsnation">@vsnation</a>
</p>
