#!/bin/bash
# BEAM Light Wallet - Install & Run
# Developed by @vsnation
# Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
#
# First run: Downloads binaries and sets up wallet
# Subsequent runs: Just starts the wallet server

set -e

# Configuration
BEAM_VERSION="7.5.13882"
PORT=9080

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macos"; PREFIX="mac" ;;
    Linux)  PLATFORM="linux"; PREFIX="linux" ;;
    *)      echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

# Determine install directory
# If running from installed location, use current dir
# Otherwise install to ~/BEAM-LightWallet
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/serve.py" ]; then
    INSTALL_DIR="$SCRIPT_DIR"
else
    INSTALL_DIR="$HOME/BEAM-LightWallet"
fi

cd "$INSTALL_DIR" 2>/dev/null || {
    # First install - need to set up
    INSTALL_DIR="$HOME/BEAM-LightWallet"
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
}

# Check if already installed (serve.py exists)
NEEDS_INSTALL=false
if [ ! -f "$INSTALL_DIR/serve.py" ]; then
    NEEDS_INSTALL=true
fi

# Check if binaries need download
NEEDS_BINARIES=false
if [ ! -f "$INSTALL_DIR/binaries/$PLATFORM/wallet-api" ] || [ ! -f "$INSTALL_DIR/binaries/$PLATFORM/beam-wallet" ]; then
    NEEDS_BINARIES=true
fi

# Show header
echo "======================================"
echo "  BEAM Light Wallet"
echo "  Developed by @vsnation"
echo "======================================"
echo ""

# Install if needed
if [ "$NEEDS_INSTALL" = true ]; then
    echo "Installing BEAM Light Wallet..."
    echo "Platform: $PLATFORM"
    echo "Location: $INSTALL_DIR"
    echo ""

    # Check Python
    if ! command -v python3 &> /dev/null; then
        echo "Error: Python 3 is required but not installed."
        echo ""
        if [ "$PLATFORM" = "macos" ]; then
            echo "Install with: brew install python3"
            echo "Or download from: https://www.python.org/downloads/"
        else
            echo "Install with: sudo apt install python3  # Debian/Ubuntu"
            echo "           or: sudo dnf install python3  # Fedora"
        fi
        exit 1
    fi

    # Copy files from source or download
    if [ -f "$(dirname "$0")/serve.py" ] && [ "$(dirname "$0")" != "$INSTALL_DIR" ]; then
        echo "Copying wallet files..."
        cp -r "$(dirname "$0")"/* "$INSTALL_DIR/"
    elif [ ! -f "$INSTALL_DIR/serve.py" ]; then
        echo "Downloading wallet files from GitHub..."
        if command -v git &> /dev/null; then
            git clone --depth 1 https://github.com/vsnation/Beam-Light-Wallet.git "$INSTALL_DIR" 2>/dev/null || {
                # If dir exists, just pull
                cd "$INSTALL_DIR"
                git pull 2>/dev/null || true
            }
        else
            curl -L "https://github.com/vsnation/Beam-Light-Wallet/archive/main.tar.gz" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
        fi
    fi

    # Create directories
    mkdir -p "$INSTALL_DIR/binaries/$PLATFORM" "$INSTALL_DIR/wallets" "$INSTALL_DIR/logs"

    echo "Installation complete!"
    echo ""
fi

# Download binaries if needed
if [ "$NEEDS_BINARIES" = true ]; then
    echo "Downloading BEAM binaries v${BEAM_VERSION}..."
    echo ""

    # Create directories if they don't exist
    mkdir -p "$INSTALL_DIR/binaries/$PLATFORM" "$INSTALL_DIR/wallets" "$INSTALL_DIR/logs"

    GITHUB_BASE="https://github.com/BeamMW/beam/releases/download/beam-${BEAM_VERSION}"
    cd "$INSTALL_DIR/binaries/$PLATFORM"

    # wallet-api
    if [ ! -f "wallet-api" ]; then
        echo "  Downloading wallet-api..."
        curl -L -# "${GITHUB_BASE}/${PREFIX}-wallet-api-${BEAM_VERSION}.zip" -o wallet-api.zip
        unzip -o wallet-api.zip
        [ -f wallet-api.tar ] && tar -xf wallet-api.tar
        rm -f wallet-api.zip wallet-api.tar
        chmod +x wallet-api
        echo "  wallet-api ready!"
    fi

    # beam-wallet
    if [ ! -f "beam-wallet" ]; then
        echo "  Downloading beam-wallet..."
        curl -L -# "${GITHUB_BASE}/${PREFIX}-beam-wallet-cli-${BEAM_VERSION}.zip" -o beam-wallet.zip
        unzip -o beam-wallet.zip
        [ -f beam-wallet.tar ] && tar -xf beam-wallet.tar
        rm -f beam-wallet.zip beam-wallet.tar
        chmod +x beam-wallet
        echo "  beam-wallet ready!"
    fi

    # beam-node (optional)
    if [ ! -f "beam-node" ]; then
        echo "  Downloading beam-node (optional)..."
        curl -L -# "${GITHUB_BASE}/${PREFIX}-beam-node-${BEAM_VERSION}.zip" -o beam-node.zip 2>/dev/null || true
        if [ -f beam-node.zip ]; then
            unzip -o beam-node.zip 2>/dev/null || true
            [ -f beam-node.tar ] && tar -xf beam-node.tar 2>/dev/null || true
            rm -f beam-node.zip beam-node.tar
            [ -f beam-node ] && chmod +x beam-node && echo "  beam-node ready!"
        fi
    fi

    # Remove macOS quarantine flags (prevents Gatekeeper blocking)
    if [ "$PLATFORM" = "macos" ]; then
        xattr -dr com.apple.quarantine wallet-api beam-wallet beam-node 2>/dev/null || true
    fi

    cd "$INSTALL_DIR"
    echo ""
    echo "Binaries downloaded!"
    echo ""
fi

# Start the wallet
echo "Starting BEAM Light Wallet..."
echo "URL: http://127.0.0.1:$PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Kill any existing instance
pkill -f "serve.py $PORT" 2>/dev/null || true
sleep 1

# Open browser after delay
(sleep 2 && {
    if [ "$PLATFORM" = "macos" ]; then
        open "http://127.0.0.1:$PORT"
    else
        xdg-open "http://127.0.0.1:$PORT" 2>/dev/null || echo "Open http://127.0.0.1:$PORT in your browser"
    fi
}) &

# Start server
cd "$INSTALL_DIR"
python3 serve.py $PORT
