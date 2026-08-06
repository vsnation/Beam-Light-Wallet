#!/bin/bash
# BEAM Light Wallet - DMG Builder
# Creates a distributable DMG for macOS with one-click setup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
APP_NAME="BEAM Light Wallet"
DMG_NAME="Beam-Light-Wallet"

# Versions come from config/binaries.json, the single source of truth.
MANIFEST="$PROJECT_DIR/config/binaries.json"
if [ ! -f "$MANIFEST" ]; then
    echo "ERROR: version manifest not found: $MANIFEST"
    exit 1
fi

# manifest <key> [<key> ...] -> value ("" for null, true/false for booleans)
manifest() {
    python3 - "$MANIFEST" "$@" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2:]:
    d = d[k]
print(json.dumps(d) if isinstance(d, bool) else ('' if d is None else d))
PYEOF
}

VERSION="$(manifest app_version)" || true
BEAM_VERSION="$(manifest platforms macos beam_version)" || true
HF6_COMPATIBLE="$(manifest platforms macos hf6_compatible)" || true

if [ -z "$VERSION" ] || [ -z "$BEAM_VERSION" ]; then
    echo "ERROR: could not read app_version / macOS beam_version from $MANIFEST"
    exit 1
fi

echo "=== BEAM Light Wallet DMG Builder ==="
echo "Project: $PROJECT_DIR"
echo "Version: $VERSION"
echo "BEAM Version: $BEAM_VERSION"
echo ""

if [ "$HF6_COMPATIBLE" != "true" ]; then
    HF_NAME="$(manifest hardfork name)"
    HF_HEIGHT="$(manifest hardfork height)"
    echo "########################################################################"
    echo "#  WARNING: THIS DMG SHIPS BINARIES THAT CANNOT FOLLOW MAINNET.        #"
    echo "########################################################################"
    echo "#"
    echo "#  macOS BEAM version:  $BEAM_VERSION"
    echo "#  $HF_NAME activates at block:  $HF_HEIGHT"
    echo "#"
    echo "#  These binaries stall one block before the fork and never recover,"
    echo "#  so balances and transaction history will be STALE and transactions"
    echo "#  may be rejected by the network."
    echo "#"
    echo "#  $(manifest platforms macos unsupported_reason)"
    echo "#"
    echo "#  The app warns the user about this at launch as well."
    echo "########################################################################"
    echo ""
fi

# Create icon if not exists
if [ ! -f "$BUILD_DIR/AppIcon.icns" ]; then
    echo "Creating app icon..."
    "$BUILD_DIR/make-icon.sh"
fi

# Create app bundle structure
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

echo "Creating app bundle..."

# Create Info.plist
cat > "$APP_BUNDLE/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>BEAM Light Wallet</string>
    <key>CFBundleDisplayName</key>
    <string>BEAM Light Wallet</string>
    <key>CFBundleIdentifier</key>
    <string>com.beamprivacy.lightwallet</string>
    <key>CFBundleVersion</key>
    <string>$VERSION</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright 2026 BEAM Privacy. All rights reserved.</string>
</dict>
</plist>
PLIST

# Create the main launcher script (handles everything automatically)
cat > "$APP_BUNDLE/Contents/MacOS/launch" << 'LAUNCHER'
#!/bin/bash
# BEAM Light Wallet - One-Click Launcher
# Downloads binaries, auto-updates app, starts services, opens browser
# All private data stored in ~/.beam-light-wallet

set -e

# Get app resources directory
RESOURCES_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"

# All private data stored in ~/.beam-light-wallet
DATA_DIR="$HOME/.beam-light-wallet"
# BEAM_VERSION and the download asset names are NOT hardcoded: they are read
# from Resources/config/binaries.json further down.
REPO_URL="https://github.com/vsnation/Beam-Light-Wallet"
BINARIES_DIR="$DATA_DIR/binaries/macos"
WALLETS_DIR="$DATA_DIR/wallets"
LOGS_DIR="$DATA_DIR/logs"
NODE_DATA_DIR="$DATA_DIR/node_data"

# Create directories
mkdir -p "$BINARIES_DIR" "$WALLETS_DIR" "$LOGS_DIR" "$NODE_DATA_DIR"

# Remove quarantine from downloaded binaries (prevents Gatekeeper warnings)
if [ -d "$BINARIES_DIR" ]; then
    xattr -dr com.apple.quarantine "$BINARIES_DIR" 2>/dev/null || true
fi

# Migrate from old location if exists
OLD_DATA="$HOME/Library/Application Support/BEAM Light Wallet"
if [ -d "$OLD_DATA" ] && [ "$OLD_DATA" != "$DATA_DIR" ]; then
    for subdir in wallets binaries logs node_data; do
        OLD_SUB="$OLD_DATA/$subdir"
        NEW_SUB="$DATA_DIR/$subdir"
        if [ -d "$OLD_SUB" ] && [ ! -L "$OLD_SUB" ] && [ -z "$(ls -A "$NEW_SUB" 2>/dev/null)" ]; then
            echo "Migrating $subdir from old location..."
            cp -r "$OLD_SUB"/* "$NEW_SUB/" 2>/dev/null || true
        fi
    done
fi

# Symlink data directories into Resources for serve.py compatibility
# No symlinks into the bundle. serve.py resolves every writable path from
# BEAM_DATA_DIR (or ~/.beam-light-wallet), so Contents/ stays exactly as it was
# signed. Writing into a signed bundle breaks its seal and macOS then refuses to
# launch it with "the application is damaged".
export BEAM_DATA_DIR="$DATA_DIR"

# Function to show dialog
show_dialog() {
    osascript -e "display dialog \"$1\" buttons {\"OK\"} default button 1 with title \"BEAM Light Wallet\""
}

show_progress() {
    osascript -e "display notification \"$1\" with title \"BEAM Light Wallet\""
}

# Check if Python3 is available
if ! command -v python3 &> /dev/null; then
    osascript -e 'display dialog "Python 3 is required to run BEAM Light Wallet.\n\nPlease install Python 3 from python.org or via Homebrew:\n\nbrew install python3" buttons {"OK"} default button 1 with icon stop with title "BEAM Light Wallet"'
    exit 1
fi

# ==========================================
# Updates
# ==========================================
# Deliberately no self-update here. This launcher used to curl main.tar.gz and
# overwrite serve.py, src/, config/ and shaders/ INSIDE the app bundle, with no
# signature and no checksum, from whatever happened to be on the branch at that
# moment. Two problems: it shipped unreviewed HEAD to wallets holding real
# funds, and writing into Contents/ breaks a Developer ID seal so a signed build
# would refuse to launch.
#
# Updates belong to one signed channel with a verified artifact — see
# docs/PACKAGING.md. Until that ships, the app checks for a new release and
# points the user at it rather than rewriting itself.

# ==========================================
# Version manifest (single source of truth)
# ==========================================
MANIFEST="$RESOURCES_DIR/config/binaries.json"

# manifest <key> [<key> ...] -> value ("" for null/missing, true/false for bools)
manifest() {
    python3 - "$MANIFEST" "$@" <<'PYEOF' 2>/dev/null
import json, sys
d = json.load(open(sys.argv[1]))
for k in sys.argv[2:]:
    d = d[k]
print(json.dumps(d) if isinstance(d, bool) else ('' if d is None else d))
PYEOF
}

BEAM_VERSION="$(manifest platforms macos beam_version)" || true
RELEASE_BASE="$(manifest release_base)" || true

if [ -z "$BEAM_VERSION" ] || [ -z "$RELEASE_BASE" ]; then
    osascript -e 'display dialog "BEAM Light Wallet could not read its version manifest (config/binaries.json).\n\nThe installation looks incomplete. Please reinstall the app." buttons {"OK"} default button 1 with icon stop with title "BEAM Light Wallet"'
    exit 1
fi

GITHUB_BASE="$RELEASE_BASE/beam-$BEAM_VERSION"
HF6_COMPATIBLE="$(manifest platforms macos hf6_compatible)" || true

ASSET_WALLET_API="$(manifest platforms macos binaries wallet-api asset)" || true
ASSET_BEAM_WALLET="$(manifest platforms macos binaries beam-wallet asset)" || true
ASSET_BEAM_NODE="$(manifest platforms macos binaries beam-node asset)" || true

SHA_WALLET_API="$(manifest platforms macos binaries wallet-api sha256)" || true
SHA_BEAM_WALLET="$(manifest platforms macos binaries beam-wallet sha256)" || true
SHA_BEAM_NODE="$(manifest platforms macos binaries beam-node sha256)" || true

# ==========================================
# Hard fork compatibility warning
# ==========================================
HF6_WARNING=""
if [ "$HF6_COMPATIBLE" != "true" ]; then
    HF_NAME="$(manifest hardfork name)" || true
    HF_HEIGHT="$(manifest hardfork height)" || true

    # Single line with \n escapes: AppleScript string literals cannot span lines.
    HF6_WARNING="WARNING: this macOS build cannot follow mainnet.\n\nBEAM binaries $BEAM_VERSION predate the $HF_NAME hard fork at block $HF_HEIGHT. They stall one block before the fork and never recover, so the balances and transaction history shown here will be STALE, and transactions you create may be rejected.\n\n$(manifest platforms macos unsupported_reason)"

    echo ""
    echo "########################################################################"
    echo "#  WARNING: BEAM $BEAM_VERSION CANNOT FOLLOW MAINNET PAST $HF_NAME (block $HF_HEIGHT)."
    echo "#  Balances and history will be STALE. See the dialog for details."
    echo "########################################################################"
    echo ""

    # Show the dialog once per BEAM version rather than on every launch.
    HF_ACK_FILE="$DATA_DIR/.hf_warning_ack_$BEAM_VERSION"
    if [ ! -f "$HF_ACK_FILE" ]; then
        osascript -e "display dialog \"$HF6_WARNING\" buttons {\"I understand\"} default button 1 with icon caution with title \"BEAM Light Wallet - Stale Balances\"" >/dev/null 2>&1 || true
        touch "$HF_ACK_FILE" 2>/dev/null || true
    fi
fi

# ==========================================
# Download BEAM binaries if needed
# ==========================================
if [ ! -f "$BINARIES_DIR/wallet-api" ] || [ ! -f "$BINARIES_DIR/beam-wallet" ]; then
    # Show download dialog
    SETUP_MSG="BEAM Light Wallet needs to download required components (~80MB).\n\nThis is a one-time setup."
    if [ -n "$HF6_WARNING" ]; then
        SETUP_MSG="$SETUP_MSG\n\nNote: these are BEAM $BEAM_VERSION binaries, which cannot follow mainnet past the $HF_NAME fork. Balances shown will be stale."
    fi
    RESPONSE=$(osascript -e "display dialog \"$SETUP_MSG\" buttons {\"Cancel\", \"Download\"} default button 2 with title \"BEAM Light Wallet - First Run Setup\"" 2>/dev/null || echo "button returned:Cancel")

    if [[ "$RESPONSE" == *"Cancel"* ]]; then
        exit 0
    fi

    # Open terminal to show download progress
    osascript << EOF
tell application "Terminal"
    activate
    do script "cd '$RESOURCES_DIR' && echo '=== BEAM Light Wallet Setup ===' && echo '' && BEAM_VERSION='$BEAM_VERSION' BINARIES_DIR='$BINARIES_DIR' GITHUB_BASE='$GITHUB_BASE' ASSET_WALLET_API='$ASSET_WALLET_API' ASSET_BEAM_WALLET='$ASSET_BEAM_WALLET' ASSET_BEAM_NODE='$ASSET_BEAM_NODE' SHA_WALLET_API='$SHA_WALLET_API' SHA_BEAM_WALLET='$SHA_BEAM_WALLET' SHA_BEAM_NODE='$SHA_BEAM_NODE' bash -c '
        cd \"\$BINARIES_DIR\"

        # Compare an extracted binary against the sha256 pinned in config/binaries.json.
        verify_sha256() {
            if [ ! -f \"\$1\" ]; then
                echo \"\"
                echo \"  ERROR: \$1 is missing after download and extraction.\"
                echo \"  The archive did not contain the expected binary, so setup cannot\"
                echo \"  continue. Aborting.\"
                exit 1
            fi
            if [ -z \"\$2\" ]; then
                echo \"  no pinned sha256 for \$1 in binaries.json - skipping verification\"
                return 0
            fi
            ACTUAL=\$(shasum -a 256 \"\$1\" | cut -d\" \" -f1)
            if [ \"\$ACTUAL\" != \"\$2\" ]; then
                echo \"\"
                echo \"  SHA256 MISMATCH for \$1\"
                echo \"    expected: \$2\"
                echo \"    actual:   \$ACTUAL\"
                echo \"\"
                echo \"  This does not match config/binaries.json, so the download cannot\"
                echo \"  be trusted. Deleting it and aborting setup.\"
                rm -f \"\$1\"
                exit 1
            fi
            echo \"  sha256 verified: \$1\"
        }

        echo \"Downloading wallet-api...\"
        curl -fL -# \"\${GITHUB_BASE}/\${ASSET_WALLET_API}\" -o wallet-api.zip || exit 1
        unzip -o wallet-api.zip && tar -xf wallet-api.tar && rm -f wallet-api.zip wallet-api.tar && chmod +x wallet-api
        verify_sha256 wallet-api \"\$SHA_WALLET_API\" || exit 1
        echo \"wallet-api downloaded!\"

        echo \"\"
        echo \"Downloading beam-wallet...\"
        curl -fL -# \"\${GITHUB_BASE}/\${ASSET_BEAM_WALLET}\" -o beam-wallet.zip || exit 1
        unzip -o beam-wallet.zip && tar -xf beam-wallet.tar && rm -f beam-wallet.zip beam-wallet.tar && chmod +x beam-wallet
        verify_sha256 beam-wallet \"\$SHA_BEAM_WALLET\" || exit 1
        echo \"beam-wallet downloaded!\"

        echo \"\"
        echo \"Downloading beam-node...\"
        # Unlike the two above, a failed node download used to be swallowed:
        # curl without || exit 1, extraction with || true, and the verification
        # tucked inside an if [ -f ]. Setup then reported success with no node,
        # and the user discovered it much later when Local Node did nothing.
        # A missing node is not fatal - the wallet works against public nodes -
        # but it must be said out loud, not hidden.
        if curl -fL -# \"\${GITHUB_BASE}/\${ASSET_BEAM_NODE}\" -o beam-node.zip; then
            unzip -o beam-node.zip 2>/dev/null && tar -xf beam-node.tar 2>/dev/null || true
            rm -f beam-node.zip beam-node.tar
            if [ -f beam-node ]; then
                chmod +x beam-node
                verify_sha256 beam-node \"\$SHA_BEAM_NODE\" || exit 1
                echo \"beam-node downloaded!\"
            else
                echo \"\"
                echo \"  WARNING: beam-node archive downloaded but no binary inside.\"
                echo \"  The wallet will work on public nodes; Local Node will not.\"
            fi
        else
            rm -f beam-node.zip
            echo \"\"
            echo \"  WARNING: could not download beam-node.\"
            echo \"  The wallet will work on public nodes; Local Node will not be\"
            echo \"  available until you re-run setup with a working connection.\"
        fi

        echo \"\"
        echo \"Removing quarantine flags...\"
        xattr -dr com.apple.quarantine wallet-api beam-wallet beam-node 2>/dev/null || true

        echo \"\"
        echo \"=== Setup Complete! ===\"
        echo \"You can close this window.\"
        echo \"\"
        echo \"Starting BEAM Light Wallet...\"
        sleep 2
    ' && cd '$RESOURCES_DIR' && python3 serve.py 9080 &
    sleep 3
    open 'http://127.0.0.1:9080'"
end tell
EOF
    exit 0
fi

# Binaries exist, start normally
echo "Starting BEAM Light Wallet..."

# Kill any existing serve.py
pkill -f "serve.py 9080" 2>/dev/null || true
sleep 1

# Start the server
cd "$RESOURCES_DIR"
python3 serve.py 9080 > "$LOGS_DIR/serve.log" 2>&1 &
SERVER_PID=$!

# Wait for server to start
for i in {1..10}; do
    if curl -s http://127.0.0.1:9080/api/status > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Open in default browser
open "http://127.0.0.1:9080"

# Keep running - the server will handle everything
wait $SERVER_PID 2>/dev/null || true
LAUNCHER
chmod +x "$APP_BUNDLE/Contents/MacOS/launch"

# Copy icon
if [ -f "$BUILD_DIR/AppIcon.icns" ]; then
    cp "$BUILD_DIR/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/"
    echo "Icon copied to app bundle"
fi

# Copy resources from the COMMITTED tree, not the working directory.
#
# This used to `cp -r "$PROJECT_DIR/src"` and friends, which ships whatever
# happens to be on disk: editor leftovers, .DS_Store, scratch files, and any
# untracked file at all. That is not hypothetical - a directory of agent config
# containing a live API token sat untracked in this working tree, and the same
# mechanism would have shipped it to every user who installed the DMG.
#
# git archive exports exactly what is committed at BUILD_REF, so the DMG matches
# a reviewable commit and nothing else.
BUILD_REF="${BUILD_REF:-HEAD}"
echo "Copying application files from git ref: $BUILD_REF"

if ! git -C "$PROJECT_DIR" rev-parse --verify --quiet "$BUILD_REF" >/dev/null; then
    echo "ERROR: '$BUILD_REF' is not a valid git ref. Set BUILD_REF, or commit first."
    exit 1
fi

if [ -n "$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)" ]; then
    echo ""
    echo "  WARNING: the working tree has uncommitted changes."
    echo "  They will NOT be in this build - it is made from $BUILD_REF."
    echo ""
fi

EXPORT_DIR="$(mktemp -d)"
git -C "$PROJECT_DIR" archive "$BUILD_REF" | tar -x -C "$EXPORT_DIR"

for item in src js config shaders serve.py README.md; do
    if [ -e "$EXPORT_DIR/$item" ]; then
        cp -r "$EXPORT_DIR/$item" "$APP_BUNDLE/Contents/Resources/"
    fi
done
rm -rf "$EXPORT_DIR"

# Note: User data (binaries, wallets, logs, node_data) stored in
# ~/.beam-light-wallet/ to survive updates
# The launcher creates symlinks to this location

echo "App bundle created: $APP_BUNDLE"
echo ""

# Create DMG
echo "Creating DMG..."
DMG_PATH="$BUILD_DIR/$DMG_NAME-$VERSION.dmg"
rm -f "$DMG_PATH"

# Create temporary DMG folder
DMG_FOLDER="$BUILD_DIR/dmg_contents"
rm -rf "$DMG_FOLDER"
mkdir -p "$DMG_FOLDER"
cp -r "$APP_BUNDLE" "$DMG_FOLDER/"

# Create symlink to Applications
ln -s /Applications "$DMG_FOLDER/Applications"

# Add first-launch instructions for unsigned app
cat > "$DMG_FOLDER/FIRST LAUNCH - READ ME.txt" << 'README'
BEAM Light Wallet - First Launch Instructions
==============================================

If macOS shows "Apple couldn't verify the developer":

METHOD 1 (Easiest):
  Right-click the app > click "Open" > click "Open" again.
  You only need to do this ONCE.

METHOD 2 (Terminal):
  Open Terminal and run:
  xattr -cr "/Applications/BEAM Light Wallet.app"
  Then double-click the app normally.

METHOD 3 (System Settings):
  Go to System Settings > Privacy & Security
  Scroll down and click "Open Anyway" next to the BEAM message.

After the first launch, macOS will remember your choice.
README

# Create DMG using hdiutil
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_FOLDER" -ov -format UDZO "$DMG_PATH"

# Cleanup
rm -rf "$DMG_FOLDER"

echo ""
echo "=== DMG Created Successfully ==="
echo "Location: $DMG_PATH"
echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
echo ""
echo "To install:"
echo "1. Open the DMG file"
echo "2. Drag 'BEAM Light Wallet' to Applications"
echo "3. Launch from Applications folder"
echo ""
echo "First launch will download BEAM binaries (~80MB)"
echo "Data stored in: ~/.beam-light-wallet/"
echo ""
