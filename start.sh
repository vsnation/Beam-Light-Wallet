#!/bin/bash
# BEAM Light Wallet - Start
# Developed by @vsnation
# Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
#
# First run: Downloads binaries and sets up wallet
# Subsequent runs: Just starts the wallet server

set -e

# Configuration
BEAM_VERSION="7.5.13882"
PORT=9080
REPO_URL="https://github.com/vsnation/Beam-Light-Wallet"

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macos"; PREFIX="mac" ;;
    Linux)  PLATFORM="linux"; PREFIX="linux" ;;
    *)      echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

# Private data stored in ~/.beam-light-wallet (binaries, wallets, logs, node_data)
DATA_DIR="$HOME/.beam-light-wallet"
BINARIES_DIR="$DATA_DIR/binaries/$PLATFORM"
WALLETS_DIR="$DATA_DIR/wallets"
LOGS_DIR="$DATA_DIR/logs"
NODE_DATA_DIR="$DATA_DIR/node_data"

# App code directory (where serve.py, src/, etc. live)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/serve.py" ]; then
    INSTALL_DIR="$SCRIPT_DIR"
else
    INSTALL_DIR="$HOME/BEAM-LightWallet"
fi

# Create data directories
mkdir -p "$BINARIES_DIR" "$WALLETS_DIR" "$LOGS_DIR" "$NODE_DATA_DIR"

# Migrate from old data locations if they exist
migrate_old_data() {
    local OLD_DIR="$1"
    if [ -d "$OLD_DIR" ] && [ "$OLD_DIR" != "$DATA_DIR" ]; then
        for subdir in wallets binaries logs node_data; do
            OLD_SUB="$OLD_DIR/$subdir"
            NEW_SUB="$DATA_DIR/$subdir"
            if [ -d "$OLD_SUB" ] && [ ! -L "$OLD_SUB" ] && [ ! -d "$NEW_SUB" ] || [ -z "$(ls -A "$NEW_SUB" 2>/dev/null)" ]; then
                echo "Migrating $OLD_SUB -> $NEW_SUB"
                cp -r "$OLD_SUB"/* "$NEW_SUB/" 2>/dev/null || true
            fi
        done
    fi
}

# Check for old install locations
migrate_old_data "$HOME/BEAM-LightWallet"
if [ "$PLATFORM" = "macos" ]; then
    migrate_old_data "$HOME/Library/Application Support/BEAM Light Wallet"
fi

# Check if binaries need download
NEEDS_BINARIES=false
if [ ! -f "$BINARIES_DIR/wallet-api" ] || [ ! -f "$BINARIES_DIR/beam-wallet" ]; then
    NEEDS_BINARIES=true
fi

# Show header
echo "======================================"
echo "  BEAM Light Wallet"
echo "  Developed by @vsnation"
echo "======================================"
echo ""
echo "  App:  $INSTALL_DIR"
echo "  Data: $DATA_DIR"
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

# Install app code if needed (first run only)
if [ ! -f "$INSTALL_DIR/serve.py" ]; then
    echo "Installing BEAM Light Wallet..."
    echo "Platform: $PLATFORM"
    echo ""

    cd "$INSTALL_DIR" 2>/dev/null || {
        INSTALL_DIR="$HOME/BEAM-LightWallet"
        mkdir -p "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    }

    # Download app code from GitHub
    echo "Downloading wallet files from GitHub..."
    if command -v git &> /dev/null; then
        git clone --depth 1 "$REPO_URL.git" "$INSTALL_DIR" 2>/dev/null || {
            cd "$INSTALL_DIR"
            git pull 2>/dev/null || true
        }
    else
        curl -sL "$REPO_URL/archive/main.tar.gz" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
    fi

    echo "Installation complete!"
    echo ""
fi

# ==========================================
# Auto-update: check and ask user
# ==========================================
echo "Checking for updates..."
cd "$INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
    # Git repo - fast differential update
    if git fetch --quiet origin main 2>/dev/null; then
        LOCAL_REV=$(git rev-parse HEAD 2>/dev/null)
        REMOTE_REV=$(git rev-parse origin/main 2>/dev/null)
        if [ -n "$REMOTE_REV" ] && [ "$LOCAL_REV" != "$REMOTE_REV" ]; then
            # Show what changed
            echo ""
            echo "============================================"
            echo "  UPDATE AVAILABLE"
            echo "============================================"
            CHANGES=$(git log --oneline HEAD..origin/main 2>/dev/null | head -5)
            if [ -n "$CHANGES" ]; then
                echo "  Changes:"
                echo "$CHANGES" | while read -r line; do echo "    $line"; done
            fi
            echo "============================================"
            echo ""
            printf "Download update? [y/N]: "
            read -r UPDATE_CHOICE
            if [ "$UPDATE_CHOICE" = "y" ] || [ "$UPDATE_CHOICE" = "Y" ]; then
                echo "Downloading update..."
                git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || true
                echo "Updated to $(git log --oneline -1 2>/dev/null)"
            else
                echo "Update skipped. Will ask again next launch."
            fi
        else
            echo "Already up to date."
        fi
    else
        echo "Skipped (no internet connection)"
    fi
else
    # Not a git repo - check tarball for updates
    REMOTE_SHA=$(curl -s --connect-timeout 5 "https://api.github.com/repos/vsnation/Beam-Light-Wallet/commits/main" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null || echo "")
    LOCAL_SHA_FILE="$INSTALL_DIR/.last_update_sha"
    LOCAL_SHA=""
    [ -f "$LOCAL_SHA_FILE" ] && LOCAL_SHA=$(cat "$LOCAL_SHA_FILE" 2>/dev/null)

    if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
        echo ""
        echo "============================================"
        echo "  UPDATE AVAILABLE"
        echo "============================================"
        printf "Download update? [y/N]: "
        read -r UPDATE_CHOICE
        if [ "$UPDATE_CHOICE" = "y" ] || [ "$UPDATE_CHOICE" = "Y" ]; then
            echo "Downloading update..."
            TEMP_DIR=$(mktemp -d)
            if curl -sL --connect-timeout 5 "$REPO_URL/archive/main.tar.gz" -o "$TEMP_DIR/latest.tar.gz" 2>/dev/null; then
                mkdir -p "$TEMP_DIR/extracted"
                tar -xzf "$TEMP_DIR/latest.tar.gz" --strip-components=1 -C "$TEMP_DIR/extracted" 2>/dev/null
                if [ -f "$TEMP_DIR/extracted/serve.py" ]; then
                    for item in serve.py start.sh src config shaders README.md build; do
                        if [ -e "$TEMP_DIR/extracted/$item" ]; then
                            rm -rf "$INSTALL_DIR/$item"
                            cp -r "$TEMP_DIR/extracted/$item" "$INSTALL_DIR/$item"
                        fi
                    done
                    chmod +x "$INSTALL_DIR/start.sh" 2>/dev/null || true
                    echo "$REMOTE_SHA" > "$LOCAL_SHA_FILE"
                    echo "Updated to latest version!"
                fi
            fi
            rm -rf "$TEMP_DIR" 2>/dev/null
        else
            echo "Update skipped. Will ask again next launch."
        fi
    elif [ -z "$REMOTE_SHA" ]; then
        echo "Skipped (no internet connection)"
    else
        echo "Already up to date."
    fi
fi
echo ""

# Download binaries if needed (to ~/.beam-light-wallet/binaries/)
if [ "$NEEDS_BINARIES" = true ]; then
    echo "Downloading BEAM binaries v${BEAM_VERSION}..."
    echo ""

    GITHUB_BASE="https://github.com/BeamMW/beam/releases/download/beam-${BEAM_VERSION}"
    cd "$BINARIES_DIR"

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
    echo "Binaries downloaded to: $BINARIES_DIR"
    echo ""
fi

# Start the wallet
echo "Starting BEAM Light Wallet..."
echo "URL: http://127.0.0.1:$PORT"
echo "Data: $DATA_DIR"
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
