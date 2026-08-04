#!/bin/bash
# ============================================================================
# BEAM Light Wallet - Ubuntu/Debian One-Click Installer
# ============================================================================
# Developed by @vsnation
# Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../install-ubuntu.sh | bash
#   or: ./start-linux.sh (from cloned repo)
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
# BEAM_VERSION / GITHUB_BASE are NOT set here on purpose: config/binaries.json is
# the single source of truth for versions, asset names and checksums (load_manifest).
PORT=9080
REPO_URL="https://github.com/vsnation/Beam-Light-Wallet"
PLATFORM="linux"

# Private data stored in ~/.beam-light-wallet
DATA_DIR="$HOME/.beam-light-wallet"
BINARIES_DIR="$DATA_DIR/binaries/linux"
WALLETS_DIR="$DATA_DIR/wallets"
LOGS_DIR="$DATA_DIR/logs"
NODE_DATA_DIR="$DATA_DIR/node_data"

# App code directory
INSTALL_DIR="$HOME/BEAM-LightWallet"

# ============================================================================
# Version manifest (config/binaries.json)
# Single source of truth for versions, asset names and checksums.
# Parsed with python3 - jq is not installed on a clean machine.
# ============================================================================
MANIFEST=""
BEAM_VERSION=""
GITHUB_BASE=""
HF6_COMPATIBLE=""

# manifest_get <dotted.key.path> - prints the value; fails if missing or null
manifest_get() {
    if [ -z "$MANIFEST" ]; then return 1; fi
    python3 -c '
import json, sys
try:
    node = json.load(open(sys.argv[1]))
    for key in sys.argv[2].split("."):
        node = node[key]
except Exception:
    sys.exit(1)
if node is None:
    sys.exit(1)
print("true" if node is True else "false" if node is False else node)
' "$MANIFEST" "$1" 2>/dev/null
}

load_manifest() {
    for CANDIDATE in "$SCRIPT_DIR/../../config/binaries.json" "$INSTALL_DIR/config/binaries.json"; do
        if [ -f "$CANDIDATE" ]; then MANIFEST="$CANDIDATE"; break; fi
    done

    if [ -z "$MANIFEST" ]; then
        echo -e "${RED}Error: config/binaries.json not found.${NC}"
        echo "       Looked in: $SCRIPT_DIR/../../config/ and $INSTALL_DIR/config/"
        echo "       This file pins the BEAM binary versions and checksums;"
        echo "       binaries cannot be downloaded safely without it."
        exit 1
    fi

    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Error: python3 is required to read $MANIFEST.${NC}"
        exit 1
    fi

    BEAM_VERSION=$(manifest_get "platforms.$PLATFORM.beam_version" || true)
    RELEASE_BASE=$(manifest_get "release_base" || true)
    HF6_COMPATIBLE=$(manifest_get "platforms.$PLATFORM.hf6_compatible" || true)

    if [ -z "$BEAM_VERSION" ] || [ -z "$RELEASE_BASE" ]; then
        echo -e "${RED}Error: $MANIFEST has no usable entry for platform '$PLATFORM'.${NC}"
        exit 1
    fi

    # GitHub release tag convention: beam-<version>
    GITHUB_BASE="${RELEASE_BASE}/beam-${BEAM_VERSION}"
}

# Loud warning when the newest build for this platform predates the hardfork
warn_if_not_hf6_compatible() {
    if [ "$HF6_COMPATIBLE" = "true" ]; then
        return 0
    fi

    HF_NAME=$(manifest_get "hardfork.name" || echo "the latest hardfork")
    HF_HEIGHT=$(manifest_get "hardfork.height" || echo "?")
    HF_REASON=$(manifest_get "platforms.$PLATFORM.unsupported_reason" || true)

    echo ""
    echo -e "${YELLOW}################################################################${NC}"
    echo -e "${YELLOW}#  WARNING: NO ${HF_NAME}-COMPATIBLE BEAM BUILD FOR ${PLATFORM}${NC}"
    echo -e "${YELLOW}################################################################${NC}"
    echo -e "${YELLOW}#${NC}"
    echo -e "${YELLOW}#${NC}  Newest ${PLATFORM} binaries published by BeamMW: v${BEAM_VERSION}"
    echo -e "${YELLOW}#${NC}  ${HF_NAME} activated at block ${HF_HEIGHT}."
    echo -e "${YELLOW}#${NC}"
    echo -e "${YELLOW}#${NC}  These binaries CANNOT follow mainnet past the fork height."
    echo -e "${YELLOW}#${NC}  A local node stalls one block before it and never recovers, so"
    echo -e "${YELLOW}#${NC}  ${RED}BALANCES AND TRANSACTION HISTORY WILL BE STALE.${NC}"
    echo -e "${YELLOW}#${NC}  Do not treat what this wallet shows as current."
    echo -e "${YELLOW}#${NC}"
    if [ -n "$HF_REASON" ]; then
        echo -e "${YELLOW}#${NC}  $HF_REASON"
        echo -e "${YELLOW}#${NC}"
    fi
    echo -e "${YELLOW}################################################################${NC}"
    echo ""
}

# sha256 of a file - sha256sum on Linux, shasum as a fallback
sha256_of() {
    if command -v sha256sum &> /dev/null; then
        sha256sum "$1" | awk '{print $1}'
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        return 1
    fi
}

# asset_url <binary-name> - built from release_base + the asset name in the manifest
asset_url() {
    ASSET=$(manifest_get "platforms.$PLATFORM.binaries.$1.asset" || true)
    if [ -z "$ASSET" ]; then
        echo "Error: no '$1' asset listed for platform '$PLATFORM' in $MANIFEST" >&2
        return 1
    fi
    echo "${GITHUB_BASE}/${ASSET}"
}

# verify_binary <binary-name> - checks the EXTRACTED binary against the manifest.
# The pinned hash is authoritative; the *-checksum.txt shipped inside the archive
# is only a secondary check (it travels with the binary, so it proves less).
verify_binary() {
    local NAME="$1"
    local WANT HAVE SHIPPED

    if [ ! -f "$NAME" ]; then
        echo -e "  ${RED}✗ $NAME is missing after extraction - archive layout changed?${NC}"
        exit 1
    fi

    HAVE=$(sha256_of "$NAME" || true)
    if [ -z "$HAVE" ]; then
        echo -e "  ${YELLOW}⚠ no sha256sum/shasum found - cannot verify $NAME${NC}"
        return 0
    fi

    WANT=$(manifest_get "platforms.$PLATFORM.binaries.$NAME.sha256" || true)
    if [ -n "$WANT" ]; then
        if [ "$WANT" != "$HAVE" ]; then
            echo ""
            echo -e "  ${RED}✗ checksum mismatch for $NAME${NC}"
            echo "    expected (config/binaries.json): $WANT"
            echo "    actual   (downloaded file):      $HAVE"
            echo "    Refusing to install it. Delete $BINARIES_DIR and retry."
            rm -f "$NAME"
            exit 1
        fi
        echo -e "  ${GREEN}✓ $NAME sha256 verified${NC}"
    else
        echo -e "  ${YELLOW}⚠ $NAME: no pinned sha256 in manifest${NC}"
    fi

    # Secondary check against the checksum file shipped inside the archive
    if [ -f "${NAME}-checksum.txt" ]; then
        SHIPPED=$(awk '{print $1; exit}' "${NAME}-checksum.txt" 2>/dev/null || true)
        if [ -n "$SHIPPED" ] && [ "$SHIPPED" != "$HAVE" ]; then
            echo -e "  ${RED}✗ $NAME does not match its own ${NAME}-checksum.txt${NC}"
            echo "    expected: $SHIPPED"
            echo "    actual:   $HAVE"
            rm -f "$NAME"
            exit 1
        fi
        rm -f "${NAME}-checksum.txt"
    fi
}

# Version stamp for the binaries currently installed in $BINARIES_DIR
VERSION_STAMP="$BINARIES_DIR/.beam_version"

# check_installed_binaries - binaries already on disk may predate this manifest.
# Existence alone is not freshness: a machine installed before a version bump would
# otherwise keep its old build forever, which is exactly how a wallet ends up running
# a pre-hardfork binary while the manifest claims the platform is fine.
# The stamp records the version the last successful download installed.
check_installed_binaries() {
    local STAMPED NAME WANT HAVE
    STAMPED=$(cat "$VERSION_STAMP" 2>/dev/null || true)
    if [ "$STAMPED" = "$BEAM_VERSION" ]; then
        return 0
    fi

    for NAME in wallet-api beam-wallet beam-node; do
        if [ ! -f "$BINARIES_DIR/$NAME" ]; then continue; fi

        WANT=$(manifest_get "platforms.$PLATFORM.binaries.$NAME.sha256" || true)
        if [ -n "$WANT" ]; then
            HAVE=$(sha256_of "$BINARIES_DIR/$NAME" || true)
            if [ -z "$HAVE" ] || [ "$WANT" = "$HAVE" ]; then continue; fi
        elif [ -z "$STAMPED" ]; then
            # No pinned hash and no record of what was installed: which build this
            # is cannot be determined, so leave it rather than re-download blindly.
            continue
        fi

        echo -e "  ${YELLOW}⚠ replacing $NAME: not the v${BEAM_VERSION} build named in $MANIFEST${NC}"
        rm -f "$BINARIES_DIR/$NAME"
    done
}

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

# Create directories
echo ""
echo -e "${CYAN}App code:  ${NC}$INSTALL_DIR"
echo -e "${CYAN}Data dir:  ${NC}$DATA_DIR"
mkdir -p "$INSTALL_DIR" "$BINARIES_DIR" "$WALLETS_DIR" "$LOGS_DIR" "$NODE_DATA_DIR"

# Migrate from old location if exists
OLD_INSTALL="$HOME/Beam-Light-Wallet"
if [ -d "$OLD_INSTALL" ] && [ "$OLD_INSTALL" != "$INSTALL_DIR" ]; then
    for subdir in wallets binaries logs node_data; do
        OLD_SUB="$OLD_INSTALL/$subdir"
        NEW_SUB="$DATA_DIR/$subdir"
        if [ -d "$OLD_SUB" ] && [ ! -L "$OLD_SUB" ]; then
            echo -e "${YELLOW}Migrating $OLD_SUB -> $NEW_SUB${NC}"
            cp -r "$OLD_SUB"/* "$NEW_SUB/" 2>/dev/null || true
        fi
    done
fi

# Download wallet source files
echo ""
echo -e "${CYAN}Downloading wallet files...${NC}"
cd "$INSTALL_DIR"

# Check if we're running from local source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../../serve.py" ]; then
    echo "  Installing from local source..."
    cp -r "$SCRIPT_DIR/../../"* "$INSTALL_DIR/" 2>/dev/null || true
elif [ ! -f "$INSTALL_DIR/serve.py" ]; then
    echo "  Downloading from repository..."
    if command -v git &> /dev/null; then
        git clone --depth 1 "$REPO_URL.git" "$INSTALL_DIR" 2>/dev/null || {
            cd "$INSTALL_DIR"
            git pull 2>/dev/null || true
        }
    else
        curl -sL "$REPO_URL/archive/main.tar.gz" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
    fi
fi

# Read the version manifest, then warn if this platform has no post-fork build
load_manifest
warn_if_not_hf6_compatible
check_installed_binaries

# Download BEAM binaries to ~/.beam-light-wallet/binaries/linux/
echo ""
echo -e "${CYAN}Downloading BEAM binaries v${BEAM_VERSION}...${NC} (per $MANIFEST)"
cd "$BINARIES_DIR"

# wallet-api
if [ ! -f "wallet-api" ]; then
    echo "  Downloading wallet-api..."
    curl -L --progress-bar "$(asset_url wallet-api)" -o wallet-api.zip
    unzip -o wallet-api.zip >/dev/null 2>&1
    [ -f wallet-api.tar ] && tar -xf wallet-api.tar
    rm -f wallet-api.zip wallet-api.tar
    verify_binary wallet-api
    chmod +x wallet-api
    echo -e "  ${GREEN}✓ wallet-api${NC}"
fi

# beam-wallet CLI
if [ ! -f "beam-wallet" ]; then
    echo "  Downloading beam-wallet..."
    curl -L --progress-bar "$(asset_url beam-wallet)" -o beam-wallet.zip
    unzip -o beam-wallet.zip >/dev/null 2>&1
    [ -f beam-wallet.tar ] && tar -xf beam-wallet.tar
    rm -f beam-wallet.zip beam-wallet.tar
    verify_binary beam-wallet
    chmod +x beam-wallet
    echo -e "  ${GREEN}✓ beam-wallet${NC}"
fi

# beam-node (optional, for DEX support)
if [ ! -f "beam-node" ]; then
    echo "  Downloading beam-node (optional for DEX)..."
    curl -L --progress-bar "$(asset_url beam-node)" -o beam-node.zip 2>/dev/null || {
        echo -e "  ${YELLOW}⚠ beam-node download failed (optional)${NC}"
    }
    if [ -f beam-node.zip ]; then
        unzip -o beam-node.zip >/dev/null 2>&1 || true
        [ -f beam-node.tar ] && tar -xf beam-node.tar 2>/dev/null || true
        rm -f beam-node.zip beam-node.tar
        if [ -f beam-node ]; then
            verify_binary beam-node
            chmod +x beam-node
            echo -e "  ${GREEN}✓ beam-node${NC}"
        fi
    fi
fi

# Record what is installed, so the next manifest version bump is noticed
echo "$BEAM_VERSION" > "$VERSION_STAMP" 2>/dev/null || true

cd "$INSTALL_DIR"

# Create launcher script
cat > beam-wallet.sh << 'EOF'
#!/bin/bash
# BEAM Light Wallet Launcher
# Developed by @vsnation

cd "$(dirname "$0")"
PORT=${1:-9080}

# Smart relaunch: if already running, just open browser
if curl -s "http://127.0.0.1:$PORT/api/status" > /dev/null 2>&1; then
    xdg-open "http://127.0.0.1:$PORT" 2>/dev/null
    exit 0
fi

# Start server in background
nohup python3 serve.py $PORT > "$HOME/.beam-light-wallet/logs/serve.log" 2>&1 &
disown

# Wait for server
for i in $(seq 1 10); do
    curl -s "http://127.0.0.1:$PORT/api/status" > /dev/null 2>&1 && break
    sleep 0.5
done

xdg-open "http://127.0.0.1:$PORT" 2>/dev/null
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
Exec=$INSTALL_DIR/beam-wallet.sh
Icon=$INSTALL_DIR/icon.png
Terminal=false
Categories=Finance;Network;
Keywords=beam;crypto;wallet;privacy;
StartupNotify=false
EOF

# Use bundled icon (included in package)
echo ""
echo -e "${CYAN}Setting up desktop shortcut...${NC}"
if [ -f "$SCRIPT_DIR/../../icon.png" ]; then
    cp "$SCRIPT_DIR/../../icon.png" "$INSTALL_DIR/icon.png"
    echo -e "  ${GREEN}✓ Icon installed${NC}"
elif [ -f "icon.png" ]; then
    echo -e "  ${GREEN}✓ Icon already present${NC}"
else
    # Fallback: download icon
    curl -L -s "https://beam.mw/svg/logo.svg" -o icon.svg 2>/dev/null || true
    if command -v convert &> /dev/null && [ -f icon.svg ]; then
        convert icon.svg -resize 256x256 icon.png 2>/dev/null || true
    fi
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
echo -e "App code:     ${CYAN}$INSTALL_DIR${NC}"
echo -e "Private data: ${CYAN}$DATA_DIR${NC}"
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
