#!/bin/bash
# BEAM Light Wallet - Start
# Developed by @vsnation
# Donations: e17cc06481d9ae88e1e0181efee407fa8c36a861b9df723845eddc8fb1ba552048
#
# First run: Downloads binaries and sets up wallet
# Subsequent runs: Just starts the wallet server

set -e

# Configuration
# BEAM_VERSION is NOT set here on purpose: config/binaries.json is the single
# source of truth for versions, asset names and checksums (see load_manifest).
PORT=9080
REPO_URL="https://github.com/vsnation/Beam-Light-Wallet"

# ---------------------------------------------------------------------------
# Updates track RELEASE TAGS, not branch HEAD.
#
# These scripts used to fetch origin/main - whatever happened to be on the
# branch at that moment, including half-finished work. Worse, the y/N prompt
# looked like a security control but is not one: agreeing to an update verifies
# nothing. If the GitHub account or the repo were compromised, a user answering
# "y" to a legitimate-looking prompt would execute the attacker's code.
#
# A tag is at least reviewed, deliberate and immutable-by-convention. It is NOT
# a substitute for a signature: nothing here proves the tarball came from the
# maintainer. Until releases are signed (minisign or GPG, both free), treat this
# as reduced exposure, not a solved problem, and say so in the release notes.
# ---------------------------------------------------------------------------


# Detect OS (PLATFORM doubles as the key into the manifest's "platforms" object)
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
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

# ==========================================
# Version manifest (config/binaries.json)
# Single source of truth for versions, asset names and checksums.
# Parsed with python3 - jq is not installed on a clean machine.
# ==========================================
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
    for CANDIDATE in "$SCRIPT_DIR/config/binaries.json" "$INSTALL_DIR/config/binaries.json"; do
        if [ -f "$CANDIDATE" ]; then MANIFEST="$CANDIDATE"; break; fi
    done

    if [ -z "$MANIFEST" ]; then
        echo "Error: config/binaries.json not found."
        echo "       Looked in: $SCRIPT_DIR/config/ and $INSTALL_DIR/config/"
        echo "       This file pins the BEAM binary versions and checksums;"
        echo "       binaries cannot be downloaded safely without it."
        exit 1
    fi

    if ! command -v python3 &> /dev/null; then
        echo "Error: python3 is required to read $MANIFEST."
        echo "       (BEAM Light Wallet needs python3 anyway - install it and re-run.)"
        exit 1
    fi

    BEAM_VERSION=$(manifest_get "platforms.$PLATFORM.beam_version" || true)
    RELEASE_BASE=$(manifest_get "release_base" || true)
    HF6_COMPATIBLE=$(manifest_get "platforms.$PLATFORM.hf6_compatible" || true)

    if [ -z "$BEAM_VERSION" ] || [ -z "$RELEASE_BASE" ]; then
        echo "Error: $MANIFEST has no usable entry for platform '$PLATFORM'."
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
    echo "################################################################"
    echo "#  WARNING: NO ${HF_NAME}-COMPATIBLE BEAM BUILD FOR ${PLATFORM}"
    echo "################################################################"
    echo "#"
    echo "#  Newest ${PLATFORM} binaries published by BeamMW: v${BEAM_VERSION}"
    echo "#  ${HF_NAME} activated at block ${HF_HEIGHT}."
    echo "#"
    echo "#  These binaries CANNOT follow mainnet past the fork height."
    echo "#  A local node stalls one block before it and never recovers, so"
    echo "#  BALANCES AND TRANSACTION HISTORY WILL BE STALE."
    echo "#  Do not treat what this wallet shows as current."
    echo "#"
    if [ -n "$HF_REASON" ]; then
        echo "#  $HF_REASON"
        echo "#"
    fi
    echo "################################################################"
    echo ""
}

# sha256 of a file - sha256sum on Linux, shasum on macOS
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
        echo "  ERROR: $NAME is missing after extraction - archive layout changed?"
        exit 1
    fi

    HAVE=$(sha256_of "$NAME" || true)
    if [ -z "$HAVE" ]; then
        echo "  WARNING: no sha256sum/shasum found - cannot verify $NAME"
        return 0
    fi

    WANT=$(manifest_get "platforms.$PLATFORM.binaries.$NAME.sha256" || true)
    if [ -n "$WANT" ]; then
        if [ "$WANT" != "$HAVE" ]; then
            echo ""
            echo "  ERROR: checksum mismatch for $NAME"
            echo "         expected (config/binaries.json): $WANT"
            echo "         actual   (downloaded file):      $HAVE"
            echo "         Refusing to install it. Delete $BINARIES_DIR and retry."
            rm -f "$NAME"
            exit 1
        fi
        echo "  $NAME sha256 verified"
    else
        echo "  $NAME: no pinned sha256 in manifest"
    fi

    # Secondary check against the checksum file shipped inside the archive
    if [ -f "${NAME}-checksum.txt" ]; then
        SHIPPED=$(awk '{print $1; exit}' "${NAME}-checksum.txt" 2>/dev/null || true)
        if [ -n "$SHIPPED" ] && [ "$SHIPPED" != "$HAVE" ]; then
            echo "  ERROR: $NAME does not match its own ${NAME}-checksum.txt"
            echo "         expected: $SHIPPED"
            echo "         actual:   $HAVE"
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

        echo "  Replacing $NAME: not the v${BEAM_VERSION} build named in $MANIFEST"
        rm -f "$BINARIES_DIR/$NAME"
        NEEDS_BINARIES=true
    done
}

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
        curl -sL "$REPO_URL/archive/refs/tags/$(curl -s https://api.github.com/repos/vsnation/Beam-Light-Wallet/releases/latest | python3 -c "import sys,json;print(json.load(sys.stdin).get('tag_name',''))").tar.gz" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
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
    if git fetch --quiet --tags origin 2>/dev/null; then
        LOCAL_REV=$(git rev-parse HEAD 2>/dev/null)
        # Compare against the newest release tag, not the branch tip.
        LATEST_TAG=$(git tag -l --sort=-v:refname | head -1)
        REMOTE_REV=$(git rev-parse "$LATEST_TAG" 2>/dev/null)
        if [ -n "$REMOTE_REV" ] && [ "$LOCAL_REV" != "$REMOTE_REV" ]; then
            # Show what changed
            echo ""
            echo "============================================"
            echo "  UPDATE AVAILABLE"
            echo "============================================"
            CHANGES=$(git log --oneline HEAD..$(git tag -l --sort=-v:refname | head -1) 2>/dev/null | head -5)
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
                LATEST_TAG=$(git tag -l --sort=-v:refname | head -1); if [ -n "$LATEST_TAG" ]; then git checkout -q "$LATEST_TAG" 2>/dev/null || true; else echo "  No release tag found; leaving the working copy alone."; fi
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
    REMOTE_SHA=$(curl -s --connect-timeout 5 "https://api.github.com/repos/vsnation/Beam-Light-Wallet/releases/latest" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('tag_name',''))" 2>/dev/null || echo "")
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
            if curl -sL --connect-timeout 5 "$REPO_URL/archive/refs/tags/$REMOTE_SHA.tar.gz" -o "$TEMP_DIR/latest.tar.gz" 2>/dev/null; then
                mkdir -p "$TEMP_DIR/extracted"
                tar -xzf "$TEMP_DIR/latest.tar.gz" --strip-components=1 -C "$TEMP_DIR/extracted" 2>/dev/null
                if [ -f "$TEMP_DIR/extracted/serve.py" ]; then
                    # config/ is deliberately NOT in this list. It holds binaries.json, which
                    # carries the pinned SHA-256 of every BEAM binary. Replacing it from the
                    # same tarball that supplies the binary URL lets one compromised source
                    # control both the download and the hash it is checked against - the
                    # verification would then print "sha256 verified" over an attacker's
                    # binary. Config changes have to be applied by reinstalling deliberately.
                    for item in serve.py start.sh src shaders README.md build; do
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

# Read the version manifest, then warn if this platform has no post-fork build
load_manifest
warn_if_not_hf6_compatible
check_installed_binaries

# Download binaries if needed (to ~/.beam-light-wallet/binaries/)
if [ "$NEEDS_BINARIES" = true ]; then
    echo "Downloading BEAM binaries v${BEAM_VERSION} (per $MANIFEST)..."
    echo ""

    cd "$BINARIES_DIR"

    # wallet-api
    if [ ! -f "wallet-api" ]; then
        echo "  Downloading wallet-api..."
        curl -L -# "$(asset_url wallet-api)" -o wallet-api.zip
        unzip -o wallet-api.zip
        [ -f wallet-api.tar ] && tar -xf wallet-api.tar
        rm -f wallet-api.zip wallet-api.tar
        verify_binary wallet-api
        chmod +x wallet-api
        echo "  wallet-api ready!"
    fi

    # beam-wallet
    if [ ! -f "beam-wallet" ]; then
        echo "  Downloading beam-wallet..."
        curl -L -# "$(asset_url beam-wallet)" -o beam-wallet.zip
        unzip -o beam-wallet.zip
        [ -f beam-wallet.tar ] && tar -xf beam-wallet.tar
        rm -f beam-wallet.zip beam-wallet.tar
        verify_binary beam-wallet
        chmod +x beam-wallet
        echo "  beam-wallet ready!"
    fi

    # beam-node (optional)
    if [ ! -f "beam-node" ]; then
        echo "  Downloading beam-node (optional)..."
        curl -L -# "$(asset_url beam-node)" -o beam-node.zip 2>/dev/null || true
        if [ -f beam-node.zip ]; then
            unzip -o beam-node.zip 2>/dev/null || true
            [ -f beam-node.tar ] && tar -xf beam-node.tar 2>/dev/null || true
            rm -f beam-node.zip beam-node.tar
            if [ -f beam-node ]; then
                verify_binary beam-node
                chmod +x beam-node
                echo "  beam-node ready!"
            fi
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

# Record what is installed, so the next manifest version bump is noticed
echo "$BEAM_VERSION" > "$VERSION_STAMP" 2>/dev/null || true

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
