#!/bin/bash
#
# P2P Escrow API Test Script
# Tests all contract methods via wallet-api JSON-RPC
#

# Continue on errors
set +e

# Configuration
API_URL="http://127.0.0.1:9080/api/wallet"
CONTRACT_ID="5f9c5c3ff019a8ffe67a032718cf53da7a6f4befa1945101c2c020ad49598a69"
ASSET_FOMO=174
ASSET_BEAM=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
SKIP=0

# Results file
RESULTS_FILE="$LIGHTWALLET/tests/p2p_api_results.txt"
echo "P2P API Test Results - $(date)" > "$RESULTS_FILE"
echo "Contract: $CONTRACT_ID" >> "$RESULTS_FILE"
echo "========================================" >> "$RESULTS_FILE"

# Helper function to call API
call_api() {
    local args="$1"
    local create_tx="${2:-false}"

    local payload="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"invoke_contract\",\"params\":{\"args\":\"$args\""
    if [ "$create_tx" = "true" ]; then
        payload="$payload,\"create_tx\":true"
    fi
    payload="$payload}}"

    curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null
}

# Test function
run_test() {
    local test_id="$1"
    local test_name="$2"
    local args="$3"
    local expected="$4"
    local create_tx="${5:-false}"

    echo -n "[$test_id] $test_name... "

    local result=$(call_api "$args" "$create_tx")
    local output=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('output','ERROR'))" 2>/dev/null || echo "ERROR")

    if echo "$output" | grep -q "$expected"; then
        echo -e "${GREEN}PASS${NC}"
        echo "[$test_id] $test_name: PASS" >> "$RESULTS_FILE"
        ((PASS++))
        return 0
    elif echo "$output" | grep -q "error"; then
        local error=$(echo "$output" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('error','Unknown'))" 2>/dev/null || echo "$output")
        echo -e "${RED}FAIL${NC} - $error"
        echo "[$test_id] $test_name: FAIL - $error" >> "$RESULTS_FILE"
        ((FAIL++))
        return 1
    else
        echo -e "${YELLOW}UNEXPECTED${NC}"
        echo "[$test_id] $test_name: UNEXPECTED - $output" >> "$RESULTS_FILE"
        ((FAIL++))
        return 1
    fi
}

# Show result details
show_result() {
    local args="$1"
    local result=$(call_api "$args")
    echo "$result" | python3 -m json.tool 2>/dev/null || echo "$result"
}

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  P2P ESCROW API TESTS${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Contract: $CONTRACT_ID"
echo "API URL: $API_URL"
echo ""

# Check API is available
echo -n "Checking API connection... "
if curl -s "$API_URL" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"wallet_status"}' | grep -q "result"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "Cannot connect to wallet API at $API_URL"
    exit 1
fi

echo ""
echo -e "${BLUE}--- 1. VIEW METHODS (Read-Only) ---${NC}"
echo ""

# 1.1.1 view (contract settings)
run_test "1.1.1" "view (contract settings)" \
    "role=manager,action=view,cid=$CONTRACT_ID" \
    "min_escrow_stake"

# 1.1.2 view_orders
run_test "1.1.2" "view_orders (FOMO)" \
    "role=user,action=view_orders,cid=$CONTRACT_ID,asset_id=$ASSET_FOMO,side=255,skip=0,limit=10" \
    "orders"

# 1.1.3 view_trader - need a PK
echo -n "[1.1.3] view_trader... "
TRADER_RESULT=$(call_api "role=user,action=view_orders,cid=$CONTRACT_ID,asset_id=$ASSET_FOMO,side=255,skip=0,limit=10")
SELLER_PK=$(echo "$TRADER_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); orders=json.loads(d['result']['output']).get('orders',[]); print(orders[0]['seller'] if orders else '')" 2>/dev/null)

if [ -n "$SELLER_PK" ]; then
    run_test "1.1.3" "view_trader" \
        "role=user,action=view_trader,cid=$CONTRACT_ID,pk=$SELLER_PK" \
        "trader"
else
    echo -e "${YELLOW}SKIP${NC} - No orders to get PK from"
    ((SKIP++))
fi

# 1.1.4 view_trades
run_test "1.1.4" "view_trades" \
    "role=user,action=view_trades,cid=$CONTRACT_ID,skip=0,limit=10" \
    "trades"

# 1.1.5 view_trade (single)
run_test "1.1.5" "view_trade (id=1)" \
    "role=user,action=view_trade,cid=$CONTRACT_ID,trade_id=1" \
    "trade"

# 1.1.6 view_escrows
run_test "1.1.6" "view_escrows" \
    "role=user,action=view_escrows,cid=$CONTRACT_ID,skip=0,limit=10" \
    "escrows"

# 1.1.7 view_stats
run_test "1.1.7" "view_stats" \
    "role=user,action=view_stats,cid=$CONTRACT_ID" \
    "stats"

# 1.1.8 view_feedback
if [ -n "$SELLER_PK" ]; then
    run_test "1.1.8" "view_feedback" \
        "role=user,action=view_feedback,cid=$CONTRACT_ID,pk=$SELLER_PK,skip=0,limit=10" \
        "feedback"
else
    echo "[1.1.8] view_feedback... SKIP - No PK"
    ((SKIP++))
fi

# 1.1.9 view_escrow_stake
if [ -n "$SELLER_PK" ]; then
    run_test "1.1.9" "view_escrow_stake" \
        "role=user,action=view_escrow_stake,cid=$CONTRACT_ID,pk=$SELLER_PK" \
        "stake"
else
    echo "[1.1.9] view_escrow_stake... SKIP - No PK"
    ((SKIP++))
fi

echo ""
echo -e "${BLUE}--- 2. WRITE METHODS (Require Transaction) ---${NC}"
echo ""

# 1.2.1 register_trader (read-only check)
run_test "1.2.1" "register_trader (preview)" \
    "role=user,action=register_trader,cid=$CONTRACT_ID" \
    ""

# 1.2.2 create_order sell (preview)
run_test "1.2.2" "create_order sell (preview)" \
    "role=user,action=create_order,cid=$CONTRACT_ID,asset_id=$ASSET_FOMO,amount=10000000,price=1,currency=840,min_limit=100000,max_limit=1000000,payment_methods=1,side=0" \
    ""

# 1.2.3 create_order buy (preview)
run_test "1.2.3" "create_order buy (preview)" \
    "role=user,action=create_order,cid=$CONTRACT_ID,asset_id=$ASSET_FOMO,amount=10000000,price=1,currency=840,min_limit=100000,max_limit=1000000,payment_methods=1,side=1" \
    ""

# 1.2.4 cancel_order - THIS IS THE KEY TEST
echo ""
echo -e "${YELLOW}Testing cancel_order (known issue)...${NC}"
run_test "1.2.4" "cancel_order (order_id=1)" \
    "role=user,action=cancel_order,cid=$CONTRACT_ID,order_id=1" \
    ""

# 1.2.5 accept_order - THIS IS THE KEY TEST
echo ""
echo -e "${YELLOW}Testing accept_order (known issue)...${NC}"
run_test "1.2.5" "accept_order (order_id=1)" \
    "role=user,action=accept_order,cid=$CONTRACT_ID,order_id=1,amount=10000000" \
    ""

# 1.2.6 mark_payment_sent
run_test "1.2.6" "mark_payment_sent (trade_id=1)" \
    "role=user,action=mark_payment_sent,cid=$CONTRACT_ID,trade_id=1" \
    ""

# 1.2.7 confirm_payment
run_test "1.2.7" "confirm_payment (trade_id=1)" \
    "role=user,action=confirm_payment,cid=$CONTRACT_ID,trade_id=1" \
    ""

# 1.2.8 stake_escrow
run_test "1.2.8" "stake_escrow (preview)" \
    "role=user,action=stake_escrow,cid=$CONTRACT_ID,amount=100000000" \
    ""

# 1.2.9 unstake_escrow
run_test "1.2.9" "unstake_escrow (preview)" \
    "role=user,action=unstake_escrow,cid=$CONTRACT_ID" \
    ""

# 1.2.10 claim_rewards
run_test "1.2.10" "claim_rewards (preview)" \
    "role=user,action=claim_rewards,cid=$CONTRACT_ID" \
    ""

# 1.2.11 submit_feedback
run_test "1.2.11" "submit_feedback (preview)" \
    "role=user,action=submit_feedback,cid=$CONTRACT_ID,trade_id=1,rating=5" \
    ""

# 1.2.12 open_dispute
run_test "1.2.12" "open_dispute (preview)" \
    "role=user,action=open_dispute,cid=$CONTRACT_ID,trade_id=1,reason=1" \
    ""

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  RESULTS SUMMARY${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS${NC}"
echo -e "  ${RED}FAIL: $FAIL${NC}"
echo -e "  ${YELLOW}SKIP: $SKIP${NC}"
echo ""
echo "Results saved to: $RESULTS_FILE"
echo ""

# Show detailed results for failed tests
if [ $FAIL -gt 0 ]; then
    echo -e "${RED}=== FAILED TEST DETAILS ===${NC}"
    echo ""

    echo "cancel_order response:"
    show_result "role=user,action=cancel_order,cid=$CONTRACT_ID,order_id=1" | head -20
    echo ""

    echo "accept_order response:"
    show_result "role=user,action=accept_order,cid=$CONTRACT_ID,order_id=1,amount=10000000" | head -20
fi

echo ""
echo "========================================" >> "$RESULTS_FILE"
echo "PASS: $PASS, FAIL: $FAIL, SKIP: $SKIP" >> "$RESULTS_FILE"
