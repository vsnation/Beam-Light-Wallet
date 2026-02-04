#!/bin/bash
# BEAM Light Wallet - Ubuntu Uninstaller
# Developed by @vsnation

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="$HOME/Beam-Light-Wallet"

echo -e "${YELLOW}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          BEAM Light Wallet - Uninstaller                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${RED}WARNING: This will remove BEAM Light Wallet and all its data!${NC}"
echo ""

# Check what exists
echo "Checking installed components..."

FOUND=0

if [ -d "$INSTALL_DIR" ]; then
    echo -e "  ${GREEN}✓${NC} Installation directory: $INSTALL_DIR"
    if [ -d "$INSTALL_DIR/wallets" ]; then
        WALLET_COUNT=$(ls -1 "$INSTALL_DIR/wallets" 2>/dev/null | wc -l)
        echo -e "    ${YELLOW}⚠ Found $WALLET_COUNT wallet(s)${NC}"
    fi
    FOUND=1
fi

if [ -f "$HOME/.local/share/applications/beam-lightwallet.desktop" ]; then
    echo -e "  ${GREEN}✓${NC} Desktop shortcut"
    FOUND=1
fi

if [ -f "$HOME/.config/systemd/user/beam-wallet.service" ]; then
    echo -e "  ${GREEN}✓${NC} Systemd service"
    FOUND=1
fi

if [ $FOUND -eq 0 ]; then
    echo -e "${YELLOW}BEAM Light Wallet does not appear to be installed.${NC}"
    exit 0
fi

echo ""
read -p "Do you want to continue with uninstall? [y/N] " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

# Stop running processes
echo ""
echo "Stopping running processes..."
pkill -f "serve.py" 2>/dev/null || true
pkill -f "wallet-api" 2>/dev/null || true
pkill -f "beam-node" 2>/dev/null || true
sleep 1

# Stop and disable systemd service
if [ -f "$HOME/.config/systemd/user/beam-wallet.service" ]; then
    echo "Removing systemd service..."
    systemctl --user stop beam-wallet 2>/dev/null || true
    systemctl --user disable beam-wallet 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/beam-wallet.service"
    systemctl --user daemon-reload 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Systemd service removed"
fi

# Remove desktop shortcut
if [ -f "$HOME/.local/share/applications/beam-lightwallet.desktop" ]; then
    echo "Removing desktop shortcut..."
    rm -f "$HOME/.local/share/applications/beam-lightwallet.desktop"
    echo -e "  ${GREEN}✓${NC} Desktop shortcut removed"
fi

# Backup wallets before removing (optional)
if [ -d "$INSTALL_DIR/wallets" ] && [ "$(ls -A $INSTALL_DIR/wallets 2>/dev/null)" ]; then
    echo ""
    echo -e "${YELLOW}You have wallet data that will be permanently deleted.${NC}"
    read -p "Create backup of wallets before removing? [Y/n] " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        BACKUP_DIR="$HOME/BEAM-Wallet-Backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        cp -r "$INSTALL_DIR/wallets" "$BACKUP_DIR/"
        echo -e "  ${GREEN}✓${NC} Wallets backed up to: $BACKUP_DIR"
    fi
fi

# Remove installation directory
if [ -d "$INSTALL_DIR" ]; then
    echo "Removing installation directory..."
    rm -rf "$INSTALL_DIR"
    echo -e "  ${GREEN}✓${NC} Installation directory removed"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Uninstall Complete!                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Thank you for using BEAM Light Wallet!"
echo "Developed by @vsnation"
echo ""
