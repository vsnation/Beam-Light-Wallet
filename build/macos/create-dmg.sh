#!/bin/bash
# BEAM Light Wallet - DMG Builder
# Creates a distributable DMG for macOS with one-click setup

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
APP_NAME="BEAM Light Wallet"
DMG_NAME="BEAM-LightWallet"
VERSION="1.0.2"
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
# Downloads binaries, starts services, opens browser
# User data stored in ~/Library/Application Support/ to survive app updates

set -e

# Get app resources directory
RESOURCES_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"

# User data stored OUTSIDE app bundle to survive updates
DATA_DIR="$HOME/Library/Application Support/BEAM Light Wallet"
BEAM_VERSION="7.5.13882"
BINARIES_DIR="$DATA_DIR/binaries/macos"
WALLETS_DIR="$DATA_DIR/wallets"
LOGS_DIR="$DATA_DIR/logs"
NODE_DATA_DIR="$DATA_DIR/node_data"

# Create directories
mkdir -p "$BINARIES_DIR" "$WALLETS_DIR" "$LOGS_DIR" "$NODE_DATA_DIR"

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

# Function to download binaries
download_binaries() {
    local GITHUB_BASE="https://github.com/BeamMW/beam/releases/download/beam-${BEAM_VERSION}"

    echo "Downloading BEAM binaries v${BEAM_VERSION}..."
    show_progress "Downloading BEAM binaries..."

    cd "$BINARIES_DIR"

    # Download wallet-api
    if [ ! -f "wallet-api" ]; then
        echo "Downloading wallet-api..."
        curl -L -# "${GITHUB_BASE}/mac-wallet-api-${BEAM_VERSION}.zip" -o wallet-api.zip
        unzip -o wallet-api.zip
        rm wallet-api.zip
        chmod +x wallet-api
    fi

    # Download beam-wallet
    if [ ! -f "beam-wallet" ]; then
        echo "Downloading beam-wallet..."
        curl -L -# "${GITHUB_BASE}/mac-beam-wallet-cli-${BEAM_VERSION}.zip" -o beam-wallet.zip
        unzip -o beam-wallet.zip
        rm beam-wallet.zip
        chmod +x beam-wallet
    fi

    # Download beam-node (optional, for local node)
    if [ ! -f "beam-node" ]; then
        echo "Downloading beam-node..."
        curl -L -# "${GITHUB_BASE}/mac-beam-node-${BEAM_VERSION}.zip" -o beam-node.zip
        unzip -o beam-node.zip 2>/dev/null || true
        rm -f beam-node.zip
        [ -f "beam-node" ] && chmod +x beam-node
    fi

    cd "$RESOURCES_DIR"
    echo "Binaries downloaded successfully!"
}

# Check and download binaries if needed
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
# ~/Library/Application Support/BEAM Light Wallet/ to survive updates
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
echo ""
echo "Logs location after installation:"
echo "  /Applications/BEAM Light Wallet.app/Contents/Resources/logs/"
