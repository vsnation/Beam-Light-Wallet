#!/bin/bash
# BEAM Light Wallet - DMG Builder
# Creates a distributable DMG for macOS with one-click setup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
APP_NAME="BEAM Light Wallet"
DMG_NAME="Beam-Light-Wallet"
VERSION="1.0.5"
BEAM_VERSION="7.5.13882"

echo "=== BEAM Light Wallet DMG Builder ==="
echo "Project: $PROJECT_DIR"
echo "Version: $VERSION"
echo "BEAM Version: $BEAM_VERSION"
echo ""

# Create icon if not exists
if [ ! -f "$BUILD_DIR/AppIcon.icns" ]; then
    echo "Creating app icon..."
    "$BUILD_DIR/create-icon.sh"
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
BEAM_VERSION="7.5.13882"
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
cd "$RESOURCES_DIR"
[ ! -L "binaries" ] && [ ! -d "binaries" ] && ln -sf "$DATA_DIR/binaries" "binaries"
[ ! -L "wallets" ] && [ ! -d "wallets" ] && ln -sf "$WALLETS_DIR" "wallets"
[ ! -L "logs" ] && [ ! -d "logs" ] && ln -sf "$LOGS_DIR" "logs"
[ ! -L "node_data" ] && [ ! -d "node_data" ] && ln -sf "$NODE_DATA_DIR" "node_data"

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
# Auto-update: pull latest app code
# ==========================================
UPDATE_SHA_FILE="$DATA_DIR/.last_update_sha"

update_app_code() {
    local TEMP_DIR=$(mktemp -d)
    if curl -sL --connect-timeout 5 "$REPO_URL/archive/main.tar.gz" -o "$TEMP_DIR/latest.tar.gz" 2>/dev/null; then
        mkdir -p "$TEMP_DIR/extracted"
        tar -xzf "$TEMP_DIR/latest.tar.gz" --strip-components=1 -C "$TEMP_DIR/extracted" 2>/dev/null
        if [ -f "$TEMP_DIR/extracted/serve.py" ]; then
            # Update app files in Resources (symlinks to user data are preserved)
            cp "$TEMP_DIR/extracted/serve.py" "$RESOURCES_DIR/" 2>/dev/null || true
            rm -rf "$RESOURCES_DIR/src" && cp -r "$TEMP_DIR/extracted/src" "$RESOURCES_DIR/" 2>/dev/null || true
            rm -rf "$RESOURCES_DIR/config" && cp -r "$TEMP_DIR/extracted/config" "$RESOURCES_DIR/" 2>/dev/null || true
            [ -d "$TEMP_DIR/extracted/shaders" ] && rm -rf "$RESOURCES_DIR/shaders" && cp -r "$TEMP_DIR/extracted/shaders" "$RESOURCES_DIR/" 2>/dev/null || true
            echo "App code updated!"
        fi
    fi
    rm -rf "$TEMP_DIR" 2>/dev/null
}

echo "Checking for updates..."
REMOTE_SHA=$(curl -s --connect-timeout 5 "https://api.github.com/repos/vsnation/Beam-Light-Wallet/commits/main" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null || echo "")
LOCAL_SHA=""
[ -f "$UPDATE_SHA_FILE" ] && LOCAL_SHA=$(cat "$UPDATE_SHA_FILE" 2>/dev/null)

if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
    echo "Update available, downloading..."
    show_progress "Updating BEAM Light Wallet..."
    update_app_code
    echo "$REMOTE_SHA" > "$UPDATE_SHA_FILE"
elif [ -z "$REMOTE_SHA" ]; then
    echo "Update check skipped (no internet)"
else
    echo "Up to date."
fi

# ==========================================
# Download BEAM binaries if needed
# ==========================================
if [ ! -f "$BINARIES_DIR/wallet-api" ] || [ ! -f "$BINARIES_DIR/beam-wallet" ]; then
    # Show download dialog
    RESPONSE=$(osascript -e 'display dialog "BEAM Light Wallet needs to download required components (~80MB).\n\nThis is a one-time setup." buttons {"Cancel", "Download"} default button 2 with title "BEAM Light Wallet - First Run Setup"' 2>/dev/null || echo "button returned:Cancel")

    if [[ "$RESPONSE" == *"Cancel"* ]]; then
        exit 0
    fi

    # Open terminal to show download progress
    osascript << EOF
tell application "Terminal"
    activate
    do script "cd '$RESOURCES_DIR' && echo '=== BEAM Light Wallet Setup ===' && echo '' && BEAM_VERSION='$BEAM_VERSION' BINARIES_DIR='$BINARIES_DIR' bash -c '
        GITHUB_BASE=\"https://github.com/BeamMW/beam/releases/download/beam-\${BEAM_VERSION}\"
        cd \"\$BINARIES_DIR\"

        echo \"Downloading wallet-api...\"
        curl -L -# \"\${GITHUB_BASE}/mac-wallet-api-\${BEAM_VERSION}.zip\" -o wallet-api.zip
        unzip -o wallet-api.zip && tar -xf wallet-api.tar && rm -f wallet-api.zip wallet-api.tar && chmod +x wallet-api
        echo \"wallet-api downloaded!\"

        echo \"\"
        echo \"Downloading beam-wallet...\"
        curl -L -# \"\${GITHUB_BASE}/mac-beam-wallet-cli-\${BEAM_VERSION}.zip\" -o beam-wallet.zip
        unzip -o beam-wallet.zip && tar -xf beam-wallet.tar && rm -f beam-wallet.zip beam-wallet.tar && chmod +x beam-wallet
        echo \"beam-wallet downloaded!\"

        echo \"\"
        echo \"Downloading beam-node...\"
        curl -L -# \"\${GITHUB_BASE}/mac-beam-node-\${BEAM_VERSION}.zip\" -o beam-node.zip
        unzip -o beam-node.zip 2>/dev/null && tar -xf beam-node.tar 2>/dev/null || true
        rm -f beam-node.zip beam-node.tar
        [ -f beam-node ] && chmod +x beam-node && echo \"beam-node downloaded!\"

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

# Copy resources
echo "Copying application files..."
cp -r "$PROJECT_DIR/src" "$APP_BUNDLE/Contents/Resources/"
cp -r "$PROJECT_DIR/js" "$APP_BUNDLE/Contents/Resources/" 2>/dev/null || true
cp -r "$PROJECT_DIR/config" "$APP_BUNDLE/Contents/Resources/"
cp -r "$PROJECT_DIR/shaders" "$APP_BUNDLE/Contents/Resources/" 2>/dev/null || true
cp "$PROJECT_DIR/serve.py" "$APP_BUNDLE/Contents/Resources/"
cp "$PROJECT_DIR/README.md" "$APP_BUNDLE/Contents/Resources/"

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
