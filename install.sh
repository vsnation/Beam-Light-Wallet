#!/bin/bash
# BEAM Light Wallet - One-Click Installer
# Developed by @vsnation
# Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
# Works on macOS and Linux

set -e

echo "======================================"
echo "  BEAM Light Wallet Installer"
echo "  Developed by @vsnation"
echo "======================================"
echo ""
echo "Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048"
echo ""

# Configuration
BEAM_VERSION="7.5.13882"
INSTALL_DIR="$HOME/BEAM-LightWallet"
PORT=9080

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

echo "Detected platform: $PLATFORM"
echo "Installing to: $INSTALL_DIR"
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

echo "Python 3 found: $(python3 --version)"

# Create install directory
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download wallet files (from GitHub or local copy)
echo ""
echo "Downloading wallet files..."

# If this is a local install, copy files
if [ -f "$(dirname "$0")/serve.py" ]; then
    echo "Installing from local source..."
    cp -r "$(dirname "$0")"/* "$INSTALL_DIR/"
else
    echo "Downloading from GitHub..."
    # Clone or download release
    if command -v git &> /dev/null; then
        git clone --depth 1 https://github.com/vsnation/Beam-Light-Wallet.git "$INSTALL_DIR" 2>/dev/null || true
    else
        curl -L "https://github.com/vsnation/Beam-Light-Wallet/archive/main.tar.gz" | tar -xz --strip-components=1
    fi
fi

# Create directories
mkdir -p binaries/$PLATFORM wallets logs

# Download BEAM binaries
GITHUB_BASE="https://github.com/BeamMW/beam/releases/download/beam-${BEAM_VERSION}"
cd binaries/$PLATFORM

echo ""
echo "Downloading BEAM binaries v${BEAM_VERSION}..."

if [ "$PLATFORM" = "macos" ]; then
    PREFIX="mac"
else
    PREFIX="linux"
fi

# wallet-api
if [ ! -f "wallet-api" ]; then
    echo "  - wallet-api..."
    curl -L -# "${GITHUB_BASE}/${PREFIX}-wallet-api-${BEAM_VERSION}.zip" -o wallet-api.zip
    unzip -o wallet-api.zip
    [ -f wallet-api.tar ] && tar -xf wallet-api.tar
    rm -f wallet-api.zip wallet-api.tar
    chmod +x wallet-api
fi

# beam-wallet
if [ ! -f "beam-wallet" ]; then
    echo "  - beam-wallet..."
    curl -L -# "${GITHUB_BASE}/${PREFIX}-beam-wallet-cli-${BEAM_VERSION}.zip" -o beam-wallet.zip
    unzip -o beam-wallet.zip
    [ -f beam-wallet.tar ] && tar -xf beam-wallet.tar
    rm -f beam-wallet.zip beam-wallet.tar
    chmod +x beam-wallet
fi

# beam-node (optional)
if [ ! -f "beam-node" ]; then
    echo "  - beam-node (optional)..."
    curl -L -# "${GITHUB_BASE}/${PREFIX}-beam-node-${BEAM_VERSION}.zip" -o beam-node.zip 2>/dev/null || true
    if [ -f beam-node.zip ]; then
        unzip -o beam-node.zip 2>/dev/null || true
        [ -f beam-node.tar ] && tar -xf beam-node.tar 2>/dev/null || true
        rm -f beam-node.zip beam-node.tar
        [ -f beam-node ] && chmod +x beam-node
    fi
fi

cd "$INSTALL_DIR"

# Create start script
cat > start.sh << 'STARTSCRIPT'
#!/bin/bash
cd "$(dirname "$0")"
echo "Starting BEAM Light Wallet..."
echo "Open http://127.0.0.1:9080 in your browser"
echo ""
python3 serve.py 9080
STARTSCRIPT
chmod +x start.sh

# Create stop script
cat > stop.sh << 'STOPSCRIPT'
#!/bin/bash
pkill -f "serve.py 9080" 2>/dev/null && echo "BEAM Light Wallet stopped" || echo "Not running"
STOPSCRIPT
chmod +x stop.sh

echo ""
echo "======================================"
echo "  Installation Complete!"
echo "======================================"
echo ""
echo "To start the wallet:"
echo "  cd $INSTALL_DIR"
echo "  ./start.sh"
echo ""
echo "Or run directly:"
echo "  python3 $INSTALL_DIR/serve.py 9080"
echo ""
echo "Then open: http://127.0.0.1:9080"
echo ""

# Ask to start now
read -p "Start the wallet now? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    echo ""
    echo "Starting wallet..."

    # Open browser after delay
    (sleep 3 && {
        if [ "$PLATFORM" = "macos" ]; then
            open "http://127.0.0.1:$PORT"
        else
            xdg-open "http://127.0.0.1:$PORT" 2>/dev/null || echo "Open http://127.0.0.1:$PORT in your browser"
        fi
    }) &

    # Start server
    python3 serve.py $PORT
fi
