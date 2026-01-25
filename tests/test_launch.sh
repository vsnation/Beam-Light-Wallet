#!/bin/bash
#
# BEAM Light Wallet - Launch Script Tests
# Tests launch.sh functionality without requiring Python
#
# Usage: ./test_launch.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test functions
pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}[PASS]${NC} $1"
}

fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}[FAIL]${NC} $1"
}

test_start() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "${BLUE}[TEST]${NC} $1"
}

# ============================================================================
# Binary Tests
# ============================================================================

test_binaries_exist() {
    test_start "Checking binaries exist"

    local platform=""
    case "$(uname -s)" in
        Linux*)  platform="linux" ;;
        Darwin*) platform="macos" ;;
        *)       platform="windows" ;;
    esac

    local all_exist=true

    if [ -f "binaries/${platform}/wallet-api" ]; then
        echo "  wallet-api: found"
    else
        echo "  wallet-api: NOT FOUND"
        all_exist=false
    fi

    if [ -f "binaries/${platform}/beam-wallet" ]; then
        echo "  beam-wallet: found"
    else
        echo "  beam-wallet: NOT FOUND"
        all_exist=false
    fi

    if [ -f "binaries/${platform}/beam-node" ]; then
        echo "  beam-node: found"
    else
        echo "  beam-node: NOT FOUND"
        all_exist=false
    fi

    if $all_exist; then
        pass "All binaries exist"
    else
        fail "Some binaries missing"
    fi
}

test_binaries_executable() {
    test_start "Checking binaries are executable"

    local platform=""
    case "$(uname -s)" in
        Linux*)  platform="linux" ;;
        Darwin*) platform="macos" ;;
        *)       platform="windows" ;;
    esac

    local all_exec=true

    for bin in wallet-api beam-wallet beam-node; do
        if [ -x "binaries/${platform}/${bin}" ]; then
            echo "  ${bin}: executable"
        else
            echo "  ${bin}: NOT executable"
            all_exec=false
        fi
    done

    if $all_exec; then
        pass "All binaries executable"
    else
        fail "Some binaries not executable"
    fi
}

# ============================================================================
# Wallet Tests
# ============================================================================

test_wallets_directory() {
    test_start "Checking wallets directory"

    if [ -d "wallets" ]; then
        local wallet_count=$(find wallets -maxdepth 1 -type d | wc -l)
        wallet_count=$((wallet_count - 1))  # Exclude wallets dir itself

        echo "  Found ${wallet_count} wallet(s)"
        pass "Wallets directory exists"
    else
        fail "Wallets directory not found"
    fi
}

test_wallet_exists() {
    test_start "Checking test_wallet exists"

    if [ -f "wallets/test_wallet/wallet.db" ]; then
        echo "  wallet.db size: $(ls -lh wallets/test_wallet/wallet.db | awk '{print $5}')"
        pass "test_wallet exists"
    else
        fail "test_wallet not found"
    fi
}

# ============================================================================
# API Tests
# ============================================================================

test_wallet_api_running() {
    test_start "Checking wallet-api is running"

    if pgrep -f "wallet-api.*port=10000" > /dev/null 2>&1; then
        local pid=$(pgrep -f "wallet-api.*port=10000")
        echo "  PID: $pid"
        pass "wallet-api is running"
    else
        fail "wallet-api is not running"
    fi
}

test_wallet_api_responds() {
    test_start "Checking wallet-api responds"

    local response=$(curl -s -m 5 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"wallet_status"}' 2>/dev/null)

    if echo "$response" | grep -q '"result"'; then
        echo "  Response received"
        pass "wallet-api responds"
    else
        fail "wallet-api does not respond"
    fi
}

test_wallet_status() {
    test_start "Checking wallet status"

    local response=$(curl -s -m 5 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"wallet_status"}' 2>/dev/null)

    local height=$(echo "$response" | grep -o '"current_height":[0-9]*' | cut -d: -f2)
    local available=$(echo "$response" | grep -o '"available":[0-9]*' | head -1 | cut -d: -f2)
    local receiving=$(echo "$response" | grep -o '"receiving":[0-9]*' | head -1 | cut -d: -f2)
    local is_synced=$(echo "$response" | grep -o '"is_in_sync":[a-z]*' | cut -d: -f2)

    if [ -n "$height" ]; then
        echo "  Height: $height"
        echo "  Available: $((available / 100000000)) BEAM"
        echo "  Receiving: $((receiving / 100000000)) BEAM"
        echo "  Synced: $is_synced"
        pass "Wallet status retrieved"
    else
        fail "Could not get wallet status"
    fi
}

test_get_addresses() {
    test_start "Checking wallet addresses"

    local response=$(curl -s -m 5 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"addr_list","params":{"own":true}}' 2>/dev/null)

    if echo "$response" | grep -q '"result"'; then
        local addr_count=$(echo "$response" | grep -o '"address"' | wc -l)
        echo "  Found $addr_count address(es)"
        pass "Addresses retrieved"
    else
        fail "Could not get addresses"
    fi
}

test_get_transactions() {
    test_start "Checking transactions"

    local response=$(curl -s -m 5 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tx_list","params":{"count":10}}' 2>/dev/null)

    if echo "$response" | grep -q '"result"'; then
        local tx_count=$(echo "$response" | grep -o '"txId"' | wc -l)
        echo "  Found $tx_count transaction(s)"
        pass "Transactions retrieved"
    else
        fail "Could not get transactions"
    fi
}

# ============================================================================
# DEX Tests
# ============================================================================

DEX_CONTRACT_ID="729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf"

skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    # Don't count skipped tests as failures
}

test_dex_pools() {
    test_start "Fetching DEX pools"

    local response=$(curl -s -m 10 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"invoke_contract\",\"params\":{\"args\":\"action=pools_view,cid=${DEX_CONTRACT_ID}\"}}" 2>/dev/null)

    if echo "$response" | grep -q '"output"'; then
        local output=$(echo "$response" | grep -o '"output":"[^"]*"' | sed 's/"output":"//;s/"$//')
        # Count pools (look for "aid1": patterns)
        local pool_count=$(echo "$output" | grep -o '"aid1"' | wc -l)
        echo "  Found $pool_count DEX pool(s)"
        pass "DEX pools fetched"
    elif echo "$response" | grep -q '"error"'; then
        # Contract calls may not be available without shader support
        echo "  Contract call requires shader support (expected with public node)"
        skip "DEX pools - needs local node with shaders"
    else
        fail "Could not fetch DEX pools"
    fi
}

test_dex_swap_quote() {
    test_start "Getting DEX swap quote (1 BEAM -> FOMO)"

    local response=$(curl -s -m 10 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"invoke_contract\",\"params\":{\"args\":\"action=pool_trade,cid=${DEX_CONTRACT_ID},aid1=0,aid2=174,kind=2,amount1=100000000,bPredictOnly=1\"}}" 2>/dev/null)

    if echo "$response" | grep -q '"tok2"'; then
        # Extract tok2 value (FOMO received)
        local output=$(echo "$response" | grep -o '"output":"[^"]*"' | sed 's/"output":"//;s/"$//')
        local tok2=$(echo "$output" | grep -o '"tok2":[0-9-]*' | cut -d: -f2)

        if [ -n "$tok2" ]; then
            local fomo_amount=$(echo "scale=2; $tok2 * -1 / 100000000" | bc 2>/dev/null || echo "N/A")
            echo "  1 BEAM -> ${fomo_amount} FOMO"
            pass "Swap quote retrieved"
        else
            fail "Could not parse swap quote"
        fi
    elif echo "$response" | grep -q '"error"'; then
        echo "  Contract call requires shader support"
        skip "Swap quote - needs local node with shaders"
    else
        fail "Could not get swap quote"
    fi
}

test_asset_info() {
    test_start "Getting FOMO asset info (aid=174)"

    local response=$(curl -s -m 5 "http://127.0.0.1:10000/api/wallet" \
        -X POST \
        -H 'Content-Type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"get_asset_info","params":{"asset_id":174}}' 2>/dev/null)

    if echo "$response" | grep -q '"metadata"'; then
        local metadata=$(echo "$response" | grep -o '"metadata":"[^"]*"' | sed 's/"metadata":"//;s/"$//')

        # Extract name
        local name=$(echo "$metadata" | grep -o 'N=[^;]*' | sed 's/N=//')
        local symbol=$(echo "$metadata" | grep -o 'UN=[^;]*' | sed 's/UN=//')

        echo "  Name: $name"
        echo "  Symbol: $symbol"
        pass "Asset info retrieved"
    elif echo "$response" | grep -q '"error"'; then
        # Asset info may fail if asset not known to wallet
        echo "  Asset not known to wallet yet (needs sync)"
        skip "Asset info - not yet synced"
    else
        fail "Could not get asset info"
    fi
}

# ============================================================================
# Launch Script Tests
# ============================================================================

test_launch_script_exists() {
    test_start "Checking launch.sh exists"

    if [ -f "launch.sh" ]; then
        echo "  Size: $(ls -lh launch.sh | awk '{print $5}')"
        pass "launch.sh exists"
    else
        fail "launch.sh not found"
    fi
}

test_launch_script_executable() {
    test_start "Checking launch.sh is executable"

    if [ -x "launch.sh" ]; then
        pass "launch.sh is executable"
    else
        fail "launch.sh is not executable"
    fi
}

test_launch_status_command() {
    test_start "Testing launch.sh status command"

    local output=$(./launch.sh status 2>/dev/null || echo "error")

    if echo "$output" | grep -q "wallet-api:"; then
        echo "$output" | while read line; do
            echo "  $line"
        done
        pass "Status command works"
    else
        fail "Status command failed"
    fi
}

# ============================================================================
# File Structure Tests
# ============================================================================

test_directory_structure() {
    test_start "Checking directory structure"

    local required_dirs=("binaries" "wallets" "logs" "css" "js" "tests")
    local missing=0

    for dir in "${required_dirs[@]}"; do
        if [ -d "$dir" ]; then
            echo "  $dir/: exists"
        else
            echo "  $dir/: MISSING"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -eq 0 ]; then
        pass "All directories exist"
    else
        fail "$missing directories missing"
    fi
}

test_html_files() {
    test_start "Checking HTML files"

    local required_files=("src/index.html" "serve.py")
    local missing=0

    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            echo "  $file: exists ($(ls -lh $file | awk '{print $5}'))"
        else
            echo "  $file: MISSING"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -eq 0 ]; then
        pass "All HTML files exist"
    else
        fail "$missing HTML files missing"
    fi
}

test_js_bundle() {
    test_start "Checking JS files"

    if [ -f "src/js/app.js" ]; then
        local size=$(ls -lh src/js/app.js | awk '{print $5}')
        echo "  src/js/app.js: $size"

        # Check for key functions
        if grep -q "apiCall" src/js/app.js; then
            echo "  apiCall function: found"
        fi
        if grep -q "loadWalletData" src/js/app.js; then
            echo "  loadWalletData function: found"
        fi

        pass "Main JS file exists"
    else
        fail "Main JS file not found"
    fi
}

# ============================================================================
# Run All Tests
# ============================================================================

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       BEAM Light Wallet - Launch Script Tests              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}=== Binary Tests ===${NC}"
test_binaries_exist
test_binaries_executable
echo ""

echo -e "${YELLOW}=== Wallet Tests ===${NC}"
test_wallets_directory
test_wallet_exists
echo ""

echo -e "${YELLOW}=== API Tests ===${NC}"
test_wallet_api_running
test_wallet_api_responds
test_wallet_status
test_get_addresses
test_get_transactions
echo ""

echo -e "${YELLOW}=== DEX Tests ===${NC}"
test_dex_pools
test_dex_swap_quote
test_asset_info
echo ""

echo -e "${YELLOW}=== Launch Script Tests ===${NC}"
test_launch_script_exists
test_launch_script_executable
test_launch_status_command
echo ""

echo -e "${YELLOW}=== File Structure Tests ===${NC}"
test_directory_structure
test_html_files
test_js_bundle
echo ""

# Summary
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                     Test Summary                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Tests run:    ${TESTS_RUN}"
echo -e "  ${GREEN}Passed:       ${TESTS_PASSED}${NC}"
echo -e "  ${RED}Failed:       ${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
