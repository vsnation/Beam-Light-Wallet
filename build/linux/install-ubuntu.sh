#!/bin/bash
# ============================================================================
# BEAM Light Wallet - Ubuntu/Debian One-Click Installer
# ============================================================================
# Developed by @vsnation
# Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../install-ubuntu.sh | bash
#   or
#   wget -qO- https://raw.githubusercontent.com/.../install-ubuntu.sh | bash
#
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BEAM_VERSION="7.5.13882"
INSTALL_DIR="$HOME/BEAM-LightWallet"
PORT=9080
GITHUB_BASE="https://github.com/BeamMW/beam/releases/download/beam-${BEAM_VERSION}"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          BEAM Light Wallet - Ubuntu Installer                ║"
echo "║                  Developed by @vsnation                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Donations: e17cc06481d9ae88e1e0181efee407fa...ba552048      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running on Ubuntu/Debian
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo -e "Detected OS: ${GREEN}$PRETTY_NAME${NC}"
else
    echo -e "${YELLOW}Warning: Could not detect OS, assuming Debian-based${NC}"
fi

# Check for required dependencies
echo ""
echo -e "${CYAN}Checking dependencies...${NC}"

MISSING_DEPS=""

# Check Python 3
if ! command -v python3 &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS python3"
fi

# Check curl
if ! command -v curl &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS curl"
fi

# Check unzip
if ! command -v unzip &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS unzip"
fi

# Install missing dependencies
if [ -n "$MISSING_DEPS" ]; then
    echo -e "${YELLOW}Installing missing dependencies:${NC}$MISSING_DEPS"
    sudo apt update
    sudo apt install -y $MISSING_DEPS
fi

echo -e "${GREEN}✓ All dependencies satisfied${NC}"
echo "  Python: $(python3 --version)"

# Create install directory
echo ""
echo -e "${CYAN}Installing to: ${NC}$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Create directory structure
mkdir -p binaries/linux wallets logs src/css src/js

# Download wallet source files
echo ""
echo -e "${CYAN}Downloading wallet files...${NC}"

# Check if we're running from local source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../serve.py" ]; then
    echo "  Installing from local source..."
    cp "$SCRIPT_DIR/../serve.py" "$INSTALL_DIR/"
    cp -r "$SCRIPT_DIR/../src/"* "$INSTALL_DIR/src/" 2>/dev/null || true
else
    echo "  Downloading from repository..."
    # Download serve.py and frontend files
    # TODO: Replace with actual GitHub raw URLs when published
    echo -e "${YELLOW}  Note: Download URLs need to be configured for your repository${NC}"
fi

# Download BEAM binaries
echo ""
echo -e "${CYAN}Downloading BEAM binaries v${BEAM_VERSION}...${NC}"
cd "$INSTALL_DIR/binaries/linux"

# wallet-api
if [ ! -f "wallet-api" ]; then
    echo "  Downloading wallet-api..."
    curl -L --progress-bar "${GITHUB_BASE}/linux-wallet-api-${BEAM_VERSION}.zip" -o wallet-api.zip
    unzip -o wallet-api.zip >/dev/null 2>&1
    [ -f wallet-api.tar ] && tar -xf wallet-api.tar
    rm -f wallet-api.zip wallet-api.tar
    chmod +x wallet-api
    echo -e "  ${GREEN}✓ wallet-api${NC}"
fi

# beam-wallet CLI
if [ ! -f "beam-wallet" ]; then
    echo "  Downloading beam-wallet..."
    curl -L --progress-bar "${GITHUB_BASE}/linux-beam-wallet-cli-${BEAM_VERSION}.zip" -o beam-wallet.zip
    unzip -o beam-wallet.zip >/dev/null 2>&1
    [ -f beam-wallet.tar ] && tar -xf beam-wallet.tar
    rm -f beam-wallet.zip beam-wallet.tar
    chmod +x beam-wallet
    echo -e "  ${GREEN}✓ beam-wallet${NC}"
fi

# beam-node (optional, for DEX support)
if [ ! -f "beam-node" ]; then
    echo "  Downloading beam-node (optional for DEX)..."
    curl -L --progress-bar "${GITHUB_BASE}/linux-beam-node-${BEAM_VERSION}.zip" -o beam-node.zip 2>/dev/null || {
        echo -e "  ${YELLOW}⚠ beam-node download failed (optional)${NC}"
    }
    if [ -f beam-node.zip ]; then
        unzip -o beam-node.zip >/dev/null 2>&1 || true
        [ -f beam-node.tar ] && tar -xf beam-node.tar 2>/dev/null || true
        rm -f beam-node.zip beam-node.tar
        [ -f beam-node ] && chmod +x beam-node && echo -e "  ${GREEN}✓ beam-node${NC}"
    fi
fi

cd "$INSTALL_DIR"

# Create launcher script
cat > beam-wallet.sh << 'EOF'
#!/bin/bash
# BEAM Light Wallet Launcher
# Developed by @vsnation

cd "$(dirname "$0")"
PORT=${1:-9080}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  BEAM Light Wallet                           ║"
echo "║                  Developed by @vsnation                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Starting wallet server on port $PORT..."
echo "Access URL: http://127.0.0.1:$PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Open browser after 2 seconds
(sleep 2 && xdg-open "http://127.0.0.1:$PORT" 2>/dev/null || {
    echo "Open http://127.0.0.1:$PORT in your browser"
}) &

# Start server
python3 serve.py $PORT
EOF
chmod +x beam-wallet.sh

# Create stop script
cat > stop-wallet.sh << 'EOF'
#!/bin/bash
pkill -f "serve.py" 2>/dev/null && echo "BEAM Light Wallet stopped" || echo "Wallet is not running"
pkill -f "wallet-api" 2>/dev/null
pkill -f "beam-node" 2>/dev/null
EOF
chmod +x stop-wallet.sh

# Create desktop entry
DESKTOP_FILE="$HOME/.local/share/applications/beam-lightwallet.desktop"
mkdir -p "$HOME/.local/share/applications"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=BEAM Light Wallet
Comment=Privacy-focused cryptocurrency wallet
Exec=gnome-terminal -- bash -c "cd $INSTALL_DIR && ./beam-wallet.sh; exec bash"
Icon=$INSTALL_DIR/icon.png
Terminal=false
Categories=Finance;Network;
Keywords=beam;crypto;wallet;privacy;
StartupNotify=true
EOF

# Download icon
echo ""
echo -e "${CYAN}Setting up desktop shortcut...${NC}"
curl -L -s "https://beam.mw/svg/logo.svg" -o icon.svg 2>/dev/null || true

# Convert SVG to PNG if possible
if command -v convert &> /dev/null && [ -f icon.svg ]; then
    convert icon.svg -resize 256x256 icon.png 2>/dev/null || true
fi

# Create systemd service (optional)
echo ""
echo -e "${CYAN}Creating systemd service (optional)...${NC}"

SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

cat > "$SYSTEMD_DIR/beam-wallet.service" << EOF
[Unit]
Description=BEAM Light Wallet Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/serve.py $PORT
ExecStop=/bin/kill -SIGTERM \$MAINPID
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Reload systemd
systemctl --user daemon-reload 2>/dev/null || true

echo -e "${GREEN}✓ Systemd service created${NC}"

# Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Installation Complete!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Install location: ${CYAN}$INSTALL_DIR${NC}"
echo ""
echo -e "${YELLOW}To start the wallet:${NC}"
echo "  cd $INSTALL_DIR"
echo "  ./beam-wallet.sh"
echo ""
echo -e "${YELLOW}Or use the desktop shortcut:${NC}"
echo "  Search for 'BEAM Light Wallet' in your applications menu"
echo ""
echo -e "${YELLOW}To run as a service (background):${NC}"
echo "  systemctl --user enable beam-wallet"
echo "  systemctl --user start beam-wallet"
echo "  Then open: http://127.0.0.1:$PORT"
echo ""
echo -e "${YELLOW}To stop:${NC}"
echo "  ./stop-wallet.sh"
echo "  or: systemctl --user stop beam-wallet"
echo ""

# Ask to start now
echo ""
read -p "Start the wallet now? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    ./beam-wallet.sh
fi
