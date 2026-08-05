#!/bin/bash
#
# Test ALL P2P contract methods for WASM errors
# Run BEFORE deploying to avoid wasting BEAM
#

API_URL="http://127.0.0.1:9080/api/wallet"
CID="95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf"
FOMO=174

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_method() {
    local name="$1"
    local args="$2"

    printf "%-30s " "$name"

    result=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"invoke_contract\",\"params\":{\"args\":\"$args\"}}" 2>/dev/null)

    if echo "$result" | grep -q "mem/bounds\|wasm/Run\|Contract call failed"; then
        echo -e "${RED}WASM ERROR${NC}"
        echo "  $result" | head -c 200
        echo ""
        return 1
    elif echo "$result" | grep -q "error"; then
        # Check if it's a contract-level error (expected) vs WASM error
        error_msg=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('output',''))" 2>/dev/null)
        if echo "$error_msg" | grep -q "error"; then
            echo -e "${YELLOW}CONTRACT ERROR${NC}: $error_msg"
            return 0  # Contract errors are OK - means WASM executed
        else
            echo -e "${RED}API ERROR${NC}"
            echo "  $result" | head -c 200
            return 1
        fi
    else
        echo -e "${GREEN}OK${NC}"
        return 0
    fi
}

echo "=============================================="
echo "  P2P CONTRACT METHOD WASM ERROR CHECK"
echo "=============================================="
echo "Contract: $CID"
echo ""

PASS=0
FAIL=0

echo "=== MANAGER METHODS ==="
test_method "view" "role=manager,action=view,cid=$CID" && ((PASS++)) || ((FAIL++))

echo ""
echo "=== USER VIEW METHODS ==="
test_method "view_orders" "role=user,action=view_orders,cid=$CID,asset_id=$FOMO,side=255,skip=0,limit=10" && ((PASS++)) || ((FAIL++))
test_method "view_trader" "role=user,action=view_trader,cid=$CID,pk=b7f710867d83a4d1bcb531ad3ba222d0863191b985a84c1d8f1b8a96787b15db01" && ((PASS++)) || ((FAIL++))
test_method "view_trades" "role=user,action=view_trades,cid=$CID,skip=0,limit=10" && ((PASS++)) || ((FAIL++))
test_method "view_trade" "role=user,action=view_trade,cid=$CID,trade_id=1" && ((PASS++)) || ((FAIL++))
test_method "view_feedback" "role=user,action=view_feedback,cid=$CID,pk=b7f710867d83a4d1bcb531ad3ba222d0863191b985a84c1d8f1b8a96787b15db01,skip=0,limit=10" && ((PASS++)) || ((FAIL++))
test_method "view_escrow_stake" "role=user,action=view_escrow_stake,cid=$CID,pk=b7f710867d83a4d1bcb531ad3ba222d0863191b985a84c1d8f1b8a96787b15db01" && ((PASS++)) || ((FAIL++))
test_method "view_dispute" "role=user,action=view_dispute,cid=$CID,dispute_id=1" && ((PASS++)) || ((FAIL++))
test_method "get_my_key" "role=user,action=get_my_key,cid=$CID" && ((PASS++)) || ((FAIL++))

echo ""
echo "=== USER WRITE METHODS (preview only) ==="
test_method "register_trader" "role=user,action=register_trader,cid=$CID" && ((PASS++)) || ((FAIL++))
test_method "create_order (sell)" "role=user,action=create_order,cid=$CID,asset_id=$FOMO,amount=10000000,price=100,currency=840,min_limit=100000,max_limit=1000000,payment_methods=1,side=0" && ((PASS++)) || ((FAIL++))
test_method "create_order (buy)" "role=user,action=create_order,cid=$CID,asset_id=$FOMO,amount=10000000,price=100,currency=840,min_limit=100000,max_limit=1000000,payment_methods=1,side=1" && ((PASS++)) || ((FAIL++))
test_method "cancel_order" "role=user,action=cancel_order,cid=$CID,order_id=1" && ((PASS++)) || ((FAIL++))
test_method "accept_order" "role=user,action=accept_order,cid=$CID,order_id=1,amount=10000000" && ((PASS++)) || ((FAIL++))
test_method "mark_payment_sent" "role=user,action=mark_payment_sent,cid=$CID,trade_id=1" && ((PASS++)) || ((FAIL++))
test_method "confirm_payment" "role=user,action=confirm_payment,cid=$CID,trade_id=1" && ((PASS++)) || ((FAIL++))
test_method "open_dispute" "role=user,action=open_dispute,cid=$CID,trade_id=1,reason=1" && ((PASS++)) || ((FAIL++))
test_method "escrow_vote" "role=user,action=escrow_vote,cid=$CID,dispute_id=1,decision=1" && ((PASS++)) || ((FAIL++))
test_method "submit_feedback" "role=user,action=submit_feedback,cid=$CID,trade_id=1,rating=5" && ((PASS++)) || ((FAIL++))
test_method "stake_escrow" "role=user,action=stake_escrow,cid=$CID,amount=100000000" && ((PASS++)) || ((FAIL++))
test_method "unstake_escrow" "role=user,action=unstake_escrow,cid=$CID" && ((PASS++)) || ((FAIL++))
test_method "claim_rewards" "role=user,action=claim_rewards,cid=$CID" && ((PASS++)) || ((FAIL++))

echo ""
echo "=== MANAGER WRITE METHODS ==="
test_method "withdraw_fees" "role=manager,action=withdraw_fees,cid=$CID,amount=100000000,asset_id=$FOMO" && ((PASS++)) || ((FAIL++))
test_method "update_settings" "role=manager,action=update_settings,cid=$CID,min_escrow_stake=100000000,trade_fee_bps=50,default_deposit_pct=10,payment_timeout=300,confirm_timeout=600,dispute_timeout=900" && ((PASS++)) || ((FAIL++))

echo ""
echo "=============================================="
echo "  RESULTS: ${GREEN}$PASS PASS${NC}, ${RED}$FAIL FAIL${NC}"
echo "=============================================="

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}DO NOT DEPLOY - WASM errors detected${NC}"
    exit 1
else
    echo -e "${GREEN}All methods OK - Safe to deploy${NC}"
    exit 0
fi
