# BEAM Light Wallet - Ubuntu/Linux Installation

**Developed by @vsnation**
**Donations:** `e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048`

## Quick Install

### One-liner (curl)
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/build/linux/install-ubuntu.sh | bash
```

### One-liner (wget)
```bash
wget -qO- https://raw.githubusercontent.com/YOUR_REPO/main/build/linux/install-ubuntu.sh | bash
```

### Manual Install
```bash
# Download installer
wget https://raw.githubusercontent.com/YOUR_REPO/main/build/linux/install-ubuntu.sh

# Make executable
chmod +x install-ubuntu.sh

# Run installer
./install-ubuntu.sh
```

## Requirements

- Ubuntu 20.04+ / Debian 11+ / Linux Mint 20+
- Python 3.8+
- curl
- unzip

The installer will automatically install missing dependencies.

## What Gets Installed

- BEAM binaries (wallet-api, beam-wallet, beam-node)
- Wallet web interface
- Desktop shortcut (GNOME/KDE)
- Systemd service (optional)

Default installation directory: `~/Beam-Light-Wallet`

## Usage

### Start Wallet (Terminal)
```bash
cd ~/Beam-Light-Wallet
./beam-wallet.sh
```

### Start Wallet (Desktop)
Search for "BEAM Light Wallet" in your applications menu.

### Run as Background Service
```bash
# Enable service to start on boot
systemctl --user enable beam-wallet

# Start service
systemctl --user start beam-wallet

# Check status
systemctl --user status beam-wallet

# View logs
journalctl --user -u beam-wallet -f

# Stop service
systemctl --user stop beam-wallet
```

### Access Wallet
Open in browser: http://127.0.0.1:9080

### Stop Wallet
```bash
./stop-wallet.sh
# or
systemctl --user stop beam-wallet
```

## Remote Access (Tailscale VPN)

To securely access your wallet from outside your network:

1. Install Tailscale on your Ubuntu server:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

2. Install Tailscale on your phone/laptop

3. Access wallet via Tailscale IP:
```
http://100.x.x.x:9080
```

**Never expose port 9080 to the public internet!**

## Files & Directories

```
~/Beam-Light-Wallet/
├── serve.py              # Main server
├── beam-wallet.sh        # Launcher script
├── stop-wallet.sh        # Stop script
├── src/                  # Web interface
├── binaries/linux/       # BEAM binaries
│   ├── wallet-api
│   ├── beam-wallet
│   └── beam-node
├── wallets/              # Wallet databases
└── logs/                 # Log files
```

## Uninstall

```bash
# Download and run uninstaller
wget https://raw.githubusercontent.com/YOUR_REPO/main/build/linux/uninstall-ubuntu.sh
chmod +x uninstall-ubuntu.sh
./uninstall-ubuntu.sh
```

Or manually:
```bash
# Stop services
pkill -f serve.py
systemctl --user stop beam-wallet
systemctl --user disable beam-wallet

# Remove files
rm -rf ~/Beam-Light-Wallet
rm -f ~/.local/share/applications/beam-lightwallet.desktop
rm -f ~/.config/systemd/user/beam-wallet.service
```

## Troubleshooting

### Wallet won't start
```bash
# Check if port is in use
sudo lsof -i :9080

# Kill existing process
pkill -f serve.py

# Check logs
cat ~/Beam-Light-Wallet/logs/*.log
```

### Browser can't connect
```bash
# Verify server is running
curl http://127.0.0.1:9080/api/status
```

### DEX not working
DEX requires local node with shaders. Public nodes don't support DEX operations.
The wallet will automatically use local node when synced.

### Permission denied
```bash
chmod +x ~/Beam-Light-Wallet/beam-wallet.sh
chmod +x ~/Beam-Light-Wallet/binaries/linux/*
```

## Support

- GitHub Issues: [Report bugs](https://github.com/YOUR_REPO/issues)
- Telegram: @vsnation
- Donations: `e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048`
