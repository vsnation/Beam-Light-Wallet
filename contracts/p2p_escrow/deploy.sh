#!/bin/bash
# P2P Escrow Contract - Build & Deploy Script
# Usage: ./deploy.sh [wallet_name] [password] [node_addr]
#
# This script:
# 1. Validates version consistency across source files
# 2. Verifies LLVM/clang is installed with wasm32 target
# 3. Compiles app.wasm and contract.wasm
# 4. Verifies WASM exports are correct
# 5. Uses beam-wallet CLI to deploy the contract
# 6. Saves the contract ID for future use
#
# NOTE: Stop wallet-api before running this script (it locks the DB)
#       pkill -f wallet-api

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIGHTWALLET_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BEAM_REPO="${LIGHTWALLET_DIR}/../beam-repo"
BEAM_SHADERS_DIR="${BEAM_REPO}/bvm/Shaders"
BINARIES_DIR="${LIGHTWALLET_DIR}/binaries/macos"
WALLETS_DIR="${LIGHTWALLET_DIR}/wallets"
OUTPUT_DIR="${LIGHTWALLET_DIR}/shaders"

# Default values
WALLET_NAME="${1:-test_wallet}"
# No default: a hardcoded password ends up in the repo, and a script that
# silently falls back to one is how it stays there.
PASSWORD="${2:?usage: deploy.sh <wallet> <password> [node_addr]}"
NODE_ADDR="${3:-127.0.0.1:10005}"  # Local node for contract deployment
MIN_ESCROW_STAKE=100000000  # 1 FOMO in groth

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  P2P Escrow Contract Build & Deploy${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Step 0: Version Validation
echo -e "${YELLOW}[0/7] Validating version consistency...${NC}"

# Extract version from contract.h
if [ ! -f "${SCRIPT_DIR}/contract.h" ]; then
    echo -e "${RED}ERROR: contract.h not found${NC}"
    exit 1
fi

CONTRACT_VERSION=$(grep "static const uint32_t CONTRACT_VERSION" "${SCRIPT_DIR}/contract.h" | sed 's/.*= *\([0-9]*\).*/\1/')

if [ -z "$CONTRACT_VERSION" ]; then
    echo -e "${RED}ERROR: Could not extract CONTRACT_VERSION from contract.h${NC}"
    exit 1
fi

echo -e "${GREEN}  CONTRACT_VERSION: ${CONTRACT_VERSION}${NC}"

# Verify all source files include contract.h (and thus have same version)
for src in contract.cpp app.cpp; do
    if [ -f "${SCRIPT_DIR}/${src}" ]; then
        if grep -q '#include "contract.h"' "${SCRIPT_DIR}/${src}"; then
            echo -e "${GREEN}  ${src}: includes contract.h ✓${NC}"
        else
            echo -e "${RED}ERROR: ${src} does not include contract.h - version mismatch possible!${NC}"
            exit 1
        fi
    fi
done

# Check that common.h is included (provides BEAM shader framework)
if [ -f "${SCRIPT_DIR}/app.cpp" ]; then
    if grep -q '#include "common.h"' "${SCRIPT_DIR}/app.cpp"; then
        echo -e "${GREEN}  app.cpp: includes common.h ✓${NC}"
    else
        echo -e "${YELLOW}  Warning: app.cpp should include common.h${NC}"
    fi
fi

# Step 1: Check dependencies
echo -e "${YELLOW}[1/7] Checking dependencies...${NC}"

# Check for LLVM/clang
CLANG_PATH=""
if command -v /opt/homebrew/opt/llvm/bin/clang &> /dev/null; then
    CLANG_PATH="/opt/homebrew/opt/llvm/bin/clang"
elif command -v /usr/local/opt/llvm/bin/clang &> /dev/null; then
    CLANG_PATH="/usr/local/opt/llvm/bin/clang"
elif command -v clang &> /dev/null; then
    CLANG_PATH="clang"
fi

if [ -z "$CLANG_PATH" ]; then
    echo -e "${RED}ERROR: LLVM/clang not found!${NC}"
    echo "Install with: brew install llvm"
    exit 1
fi
echo -e "${GREEN}  Clang: $CLANG_PATH${NC}"

# Check BEAM shaders directory
if [ ! -d "$BEAM_SHADERS_DIR" ]; then
    echo -e "${RED}ERROR: BEAM shaders directory not found at $BEAM_SHADERS_DIR${NC}"
    echo "Clone BEAM repo: git clone https://github.com/BeamMW/beam.git ${BEAM_REPO}"
    exit 1
fi
echo -e "${GREEN}  BEAM Shaders: $BEAM_SHADERS_DIR${NC}"

# Check binaries
if [ ! -f "${BINARIES_DIR}/beam-wallet" ]; then
    echo -e "${RED}ERROR: beam-wallet not found at ${BINARIES_DIR}/beam-wallet${NC}"
    echo "Run the installer first: cd ${LIGHTWALLET_DIR} && ./install.sh"
    exit 1
fi
echo -e "${GREEN}  Binaries: $BINARIES_DIR${NC}"

# Check wallet exists
WALLET_PATH="${WALLETS_DIR}/${WALLET_NAME}/wallet.db"
if [ ! -f "$WALLET_PATH" ]; then
    echo -e "${RED}ERROR: Wallet not found at $WALLET_PATH${NC}"
    echo "Create a wallet first or specify a different wallet name"
    exit 1
fi
echo -e "${GREEN}  Wallet: $WALLET_PATH${NC}"

# Check if wallet-api is running (it locks the DB)
if pgrep -f "wallet-api" > /dev/null 2>&1; then
    echo -e "${YELLOW}WARNING: wallet-api is running and may lock the wallet DB${NC}"
    echo -e "${YELLOW}  Consider stopping it: pkill -f wallet-api${NC}"
    read -p "  Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 2: Create output directory
echo -e "${YELLOW}[2/7] Preparing build directory...${NC}"
mkdir -p "$OUTPUT_DIR"
mkdir -p "${SCRIPT_DIR}/logs"
cd "$SCRIPT_DIR"

# Step 3: Compile contract.wasm
echo -e "${YELLOW}[3/7] Compiling contract.wasm (version ${CONTRACT_VERSION})...${NC}"

$CLANG_PATH -O3 \
    --target=wasm32 \
    -I"$BEAM_SHADERS_DIR" \
    -Wl,--export-dynamic,--no-entry,--allow-undefined \
    -nostdlib \
    -o contract.wasm \
    contract.cpp

if [ ! -f "contract.wasm" ]; then
    echo -e "${RED}ERROR: Failed to compile contract.wasm${NC}"
    exit 1
fi

CONTRACT_SIZE=$(stat -f%z contract.wasm 2>/dev/null || stat -c%s contract.wasm)
echo -e "${GREEN}  contract.wasm: ${CONTRACT_SIZE} bytes${NC}"

# Step 4: Compile app.wasm
echo -e "${YELLOW}[4/7] Compiling app.wasm (version ${CONTRACT_VERSION})...${NC}"

$CLANG_PATH -O3 \
    --target=wasm32 \
    -I"$BEAM_SHADERS_DIR" \
    -Wl,--export-dynamic,--no-entry,--allow-undefined \
    -nostdlib \
    -o app.wasm \
    app.cpp

if [ ! -f "app.wasm" ]; then
    echo -e "${RED}ERROR: Failed to compile app.wasm${NC}"
    exit 1
fi

APP_SIZE=$(stat -f%z app.wasm 2>/dev/null || stat -c%s app.wasm)
echo -e "${GREEN}  app.wasm: ${APP_SIZE} bytes${NC}"

# Step 5: Verify WASM exports
echo -e "${YELLOW}[5/7] Verifying WASM exports...${NC}"

if command -v wasm-objdump &> /dev/null; then
    echo "  Verifying contract.wasm exports..."
    if wasm-objdump -x contract.wasm 2>/dev/null | grep -q "Ctor"; then
        echo -e "${GREEN}    Ctor: Found${NC}"
    else
        echo -e "${RED}    Ctor: NOT FOUND!${NC}"
        exit 1
    fi

    if wasm-objdump -x contract.wasm 2>/dev/null | grep -q "Dtor"; then
        echo -e "${GREEN}    Dtor: Found${NC}"
    fi

    echo "  Verifying app.wasm exports..."
    if wasm-objdump -x app.wasm 2>/dev/null | grep -q "Method_0"; then
        echo -e "${GREEN}    Method_0 (schema): Found${NC}"
    else
        echo -e "${RED}    Method_0: NOT FOUND!${NC}"
        exit 1
    fi

    if wasm-objdump -x app.wasm 2>/dev/null | grep -q "Method_1"; then
        echo -e "${GREEN}    Method_1 (dispatch): Found${NC}"
    else
        echo -e "${RED}    Method_1: NOT FOUND!${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}  wasm-objdump not found, skipping verification${NC}"
fi

# Copy to shaders directory
cp app.wasm "${OUTPUT_DIR}/p2p_escrow_app.wasm"
cp contract.wasm "${OUTPUT_DIR}/p2p_escrow_contract.wasm"
echo -e "${GREEN}  Copied to ${OUTPUT_DIR}/${NC}"

# Step 6: Test node connection
echo -e "${YELLOW}[6/7] Testing node connection...${NC}"

# Quick connectivity test using beam-wallet
TEST_OUTPUT=$("${BINARIES_DIR}/beam-wallet" info \
    --wallet_path="$WALLET_PATH" \
    --pass="$PASSWORD" \
    --node_addr="$NODE_ADDR" 2>&1 || true)

if echo "$TEST_OUTPUT" | grep -q "error\|Error\|ERROR\|refused"; then
    echo -e "${RED}ERROR: Cannot connect to node at $NODE_ADDR${NC}"
    echo "$TEST_OUTPUT"
    echo ""
    echo "Make sure beam-node is running:"
    echo "  ${BINARIES_DIR}/beam-node --port=10005 --storage=${LIGHTWALLET_DIR}/node_data/node.db --peer=eu-node01.mainnet.beam.mw:8100"
    exit 1
fi

echo -e "${GREEN}  Node connection OK${NC}"

# Step 7: Deploy contract using beam-wallet CLI
echo -e "${YELLOW}[7/7] Deploying contract...${NC}"
echo "  Wallet: $WALLET_NAME"
echo "  Node: $NODE_ADDR"
echo "  Min Escrow Stake: $MIN_ESCROW_STAKE groth"
echo ""
echo "  This may take 1-2 minutes for blockchain confirmation..."
echo ""

# Build deployment args
DEPLOY_ARGS="role=manager,action=create,min_escrow_stake=${MIN_ESCROW_STAKE}"

# Deploy using beam-wallet shader command
DEPLOY_OUTPUT=$(echo "y" | "${BINARIES_DIR}/beam-wallet" shader \
    --wallet_path="$WALLET_PATH" \
    --pass="$PASSWORD" \
    --node_addr="$NODE_ADDR" \
    --shader_app_file="app.wasm" \
    --shader_args="$DEPLOY_ARGS" \
    --shader_contract_file="contract.wasm" 2>&1)

# Save full output to log
LOG_FILE="${SCRIPT_DIR}/logs/deploy_$(date +%Y%m%d_%H%M%S).log"
echo "$DEPLOY_OUTPUT" > "$LOG_FILE"
echo "  Full output saved to: $LOG_FILE"

# Check for errors
if echo "$DEPLOY_OUTPUT" | grep -qi "error\|failed\|exception"; then
    echo -e "${RED}ERROR: Deployment may have failed${NC}"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

# Extract contract ID from output
# beam-wallet outputs contract ID in format: "cid=abc123def..."
CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -oE "cid=[a-f0-9]{64}" | head -1 | cut -d= -f2)

# Also try to find it in "Contract ID:" format
if [ -z "$CONTRACT_ID" ]; then
    CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep -i "contract" | grep -oE "[a-f0-9]{64}" | head -1)
fi

if [ -n "$CONTRACT_ID" ] && [ ${#CONTRACT_ID} -eq 64 ]; then
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Contract deployed successfully!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  ${BLUE}Contract ID:${NC} ${CONTRACT_ID}"
    echo -e "  ${BLUE}Version:${NC} ${CONTRACT_VERSION}"
    echo ""

    # Save contract ID
    echo "$CONTRACT_ID" > "${OUTPUT_DIR}/p2p_escrow_contract_id.txt"
    echo "  Saved to: ${OUTPUT_DIR}/p2p_escrow_contract_id.txt"

    # Save deployment info
    cat > "${OUTPUT_DIR}/p2p_escrow_deployment.json" << EOF
{
    "contract_id": "${CONTRACT_ID}",
    "contract_version": ${CONTRACT_VERSION},
    "deployed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "wallet": "${WALLET_NAME}",
    "node": "${NODE_ADDR}",
    "min_escrow_stake": ${MIN_ESCROW_STAKE},
    "app_wasm_size": ${APP_SIZE},
    "contract_wasm_size": ${CONTRACT_SIZE}
}
EOF
    echo "  Deployment info: ${OUTPUT_DIR}/p2p_escrow_deployment.json"
    echo ""

    # Show next steps
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. View contract settings:"
    echo "     ${BINARIES_DIR}/beam-wallet shader \\"
    echo "         --wallet_path=$WALLET_PATH \\"
    echo "         --pass=$PASSWORD \\"
    echo "         --node_addr=$NODE_ADDR \\"
    echo "         --shader_app_file=app.wasm \\"
    echo "         --shader_args=\"role=manager,action=view,cid=$CONTRACT_ID\""
    echo ""
    echo "  2. Create an order:"
    echo "     ${BINARIES_DIR}/beam-wallet shader \\"
    echo "         --wallet_path=$WALLET_PATH \\"
    echo "         --pass=$PASSWORD \\"
    echo "         --node_addr=$NODE_ADDR \\"
    echo "         --shader_app_file=app.wasm \\"
    echo "         --shader_args=\"role=user,action=create_order,cid=$CONTRACT_ID,asset_id=174,amount=1000000000,price=100,currency=840,min_limit=100000000,max_limit=10000000000,payment_methods=1,side=0\""
    echo ""

else
    echo -e "${YELLOW}Deployment transaction submitted but contract ID not found in output${NC}"
    echo ""
    echo "Check the deployment log:"
    echo "  cat $LOG_FILE"
    echo ""
    echo "Or check transaction list:"
    echo "  ${BINARIES_DIR}/beam-wallet info --wallet_path=$WALLET_PATH --pass=$PASSWORD --node_addr=$NODE_ADDR"
fi
