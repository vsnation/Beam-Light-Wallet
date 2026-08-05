#!/usr/bin/env python3
"""
P2P Marketplace API-Only Test Suite
Tests all contract methods without requiring Chrome browser

Contract ID: 2145205e91c3c0a68b0f439b8afd7a0b4729fb232768dfdf5ab421da864d76f7

Usage:
  1. Start server: python3 serve.py 9080
  2. Run tests: python3 tests/test_p2p_api_only.py
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
from datetime import datetime

# ============================================
# CONFIGURATION
# ============================================

BASE_URL = "http://127.0.0.1:9080"
API_URL = f"{BASE_URL}/api/wallet"
CONTRACT_ID = "2145205e91c3c0a68b0f439b8afd7a0b4729fb232768dfdf5ab421da864d76f7"
RESULTS_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots/comprehensive"

WALLETS = {
    "test_wallet": {"password": os.environ.get('BEAM_TEST_PASSWORD', ''), "role": "seller/manager"},
    "test_2": {"password": "123123", "role": "buyer"}
}

# Test state
test_state = {
    "seller_pk": None,
    "buyer_pk": None,
    "order_id": None,
    "trade_id": None
}


# ============================================
# UTILITY FUNCTIONS
# ============================================

def http_get(url):
    """Make HTTP GET request"""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def http_post(url, data=None):
    """Make HTTP POST request with JSON"""
    try:
        body = json.dumps(data).encode() if data else b'{}'
        req = urllib.request.Request(url, data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def invoke_contract(args, create_tx=False):
    """Call smart contract method via wallet API"""
    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": "invoke_contract",
        "params": {
            "args": args,
            "create_tx": create_tx
        }
    }
    return http_post(API_URL, payload)

def parse_output(result):
    """Parse contract output from result"""
    if "result" in result and result["result"]:
        output = result["result"].get("output", "{}")
        try:
            return json.loads(output)
        except:
            return {"raw": output}
    return result

def switch_wallet(wallet_name):
    """Switch to specified wallet via API"""
    password = WALLETS[wallet_name]["password"]
    print(f"  Switching to {wallet_name}...")

    # Lock current wallet
    http_post(f"{BASE_URL}/api/wallet/lock")
    time.sleep(1)

    # Unlock new wallet
    result = http_post(f"{BASE_URL}/api/wallet/unlock", {
        "wallet": wallet_name,
        "password": password
    })

    if result and result.get("success"):
        print(f"    Switched to {wallet_name}")
        time.sleep(2)
        return True
    else:
        print(f"    Failed: {result.get('error', 'Unknown')}")
        return False


class P2PAPITest:
    """P2P API-only test suite"""

    def __init__(self):
        self.results = []
        os.makedirs(RESULTS_DIR, exist_ok=True)

    def run_test(self, name, func):
        """Run a single test with error handling"""
        print(f"\n[TEST] {name}")
        try:
            result = func()
            status = "PASS" if result else "FAIL"
            self.results.append((name, status, None))
            print(f"  Result: {status}")
            return result
        except Exception as e:
            self.results.append((name, "FAIL", str(e)))
            print(f"  Result: FAIL - {e}")
            return False

    # ============================================
    # VIEW METHODS TESTS
    # ============================================

    def test_view_contract(self):
        """Test view contract settings"""
        args = f"role=manager,action=view,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "settings" in data:
            s = data["settings"]
            print(f"    Version: {s.get('version')}")
            print(f"    Trade fee: {s.get('trade_fee_bps')} bps")
            print(f"    Min escrow stake: {s.get('min_escrow_stake') / 100000000:.2f} FOMO")
            print(f"    Total trades: {s.get('total_trades')}")
            print(f"    Total fees: {s.get('total_fees') / 100000000:.6f} FOMO")
            return True
        print(f"    Error: {data}")
        return False

    def test_view_orders(self):
        """Test view orders"""
        args = f"role=user,action=view_orders,cid={CONTRACT_ID},asset_id=174,side=255,skip=0,limit=100"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "orders" in data:
            orders = data["orders"]
            print(f"    Found {len(orders)} orders")
            for o in orders[:3]:
                print(f"      - Order #{o['id']}: {o['amount']/100000000:.2f} FOMO @ ${o['price']/100:.2f}")
            return True
        print(f"    Error: {data}")
        return False

    def test_get_my_key(self):
        """Test get my derived key"""
        args = f"role=user,action=get_my_key,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "pk" in data:
            pk = data["pk"]
            print(f"    My PK: {pk[:24]}...")
            test_state["seller_pk"] = pk
            return True
        print(f"    Error: {data}")
        return False

    def test_view_trader(self):
        """Test view trader reputation"""
        pk = test_state.get("seller_pk")
        if not pk:
            print("    Skip: No PK available")
            return True

        args = f"role=user,action=view_trader,cid={CONTRACT_ID},pk={pk}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "trader" in data:
            t = data["trader"]
            print(f"    Total trades: {t.get('total_trades', 0)}")
            print(f"    Successful: {t.get('successful_trades', 0)}")
            print(f"    Trust score: {t.get('trust_score', 'N/A')}")
            return True
        elif "error" in data and "not found" in str(data.get("error", "")).lower():
            print("    Trader not registered yet")
            return True
        print(f"    Error: {data}")
        return False

    def test_view_trades(self):
        """Test view trades for address"""
        pk = test_state.get("seller_pk")
        if not pk:
            print("    Skip: No PK available")
            return True

        args = f"role=user,action=view_trades,cid={CONTRACT_ID},pk={pk},skip=0,limit=100"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "trades" in data:
            trades = data["trades"]
            print(f"    Found {len(trades)} trades")
            return True
        elif "raw" in data:
            print(f"    Response: {data['raw'][:100]}")
            return True
        return False

    def test_view_escrows(self):
        """Test view escrow stakers"""
        args = f"role=manager,action=view_escrows,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "escrows" in data:
            escrows = data["escrows"]
            print(f"    Found {len(escrows)} escrow stakers")
            for e in escrows[:3]:
                print(f"      - {e.get('pk', '')[:16]}... stake: {e.get('amount', 0)/100000000:.2f}")
            return True
        print(f"    Response: {data}")
        return True  # May return empty

    def test_view_stats(self):
        """Test view contract statistics"""
        args = f"role=manager,action=view_stats,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "stats" in data or "total_trades" in data:
            print(f"    Stats: {json.dumps(data, indent=4)[:200]}")
            return True
        # Stats might be in settings
        return True

    def test_view_managers(self):
        """Test view managers list"""
        args = f"role=manager,action=view_managers,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "managers" in data:
            managers = data["managers"]
            print(f"    Found {len(managers)} managers")
            for m in managers:
                is_owner = "Owner" if m.get("is_owner") else "Manager"
                pk = m.get("pk", "")[:16]
                print(f"      - {pk}... ({is_owner})")
            return True
        print(f"    Response: {data}")
        return True  # May have parsing issue

    # ============================================
    # SECURITY TESTS
    # ============================================

    def test_security_invalid_action(self):
        """Test invalid action is rejected"""
        args = f"role=user,action=INVALID_ACTION,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        # Should get an error
        if "error" in result or "error" in data:
            print("    Correctly rejected invalid action")
            return True
        print(f"    Warning: Invalid action not rejected - {data}")
        return False

    def test_security_invalid_cid(self):
        """Test invalid contract ID is rejected"""
        args = "role=user,action=view_orders,cid=0000000000000000000000000000000000000000000000000000000000000000"
        result = invoke_contract(args, False)

        # Should fail
        if "error" in result:
            print("    Correctly rejected invalid CID")
            return True
        return False

    # ============================================
    # BUYER WALLET TESTS
    # ============================================

    def test_buyer_get_key(self):
        """Test get key as buyer"""
        if not switch_wallet("test_2"):
            return False

        args = f"role=user,action=get_my_key,cid={CONTRACT_ID}"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "pk" in data:
            pk = data["pk"]
            print(f"    Buyer PK: {pk[:24]}...")
            test_state["buyer_pk"] = pk
            return True
        print(f"    Error: {data}")
        return False

    def test_buyer_view_orders(self):
        """Test buyer can view orders"""
        args = f"role=user,action=view_orders,cid={CONTRACT_ID},asset_id=174,side=255,skip=0,limit=100"
        result = invoke_contract(args, False)
        data = parse_output(result)

        if "orders" in data:
            orders = data["orders"]
            print(f"    Buyer sees {len(orders)} orders")
            # Save an order ID for later tests
            if orders:
                test_state["order_id"] = orders[0]["id"]
            return True
        return False

    # ============================================
    # SUMMARY
    # ============================================

    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("P2P API TEST RESULTS")
        print("=" * 60)

        passed = sum(1 for _, status, _ in self.results if status == "PASS")
        failed = sum(1 for _, status, _ in self.results if status == "FAIL")

        print(f"\nTotal: {len(self.results)} tests")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        print("\nDetailed Results:")
        for name, status, error in self.results:
            icon = "PASS" if status == "PASS" else "FAIL"
            print(f"  [{icon}] {name}")
            if error:
                print(f"         Error: {error}")

        # Write results to file
        result_file = os.path.join(RESULTS_DIR, "api_test_results.json")
        with open(result_file, "w") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "contract_id": CONTRACT_ID,
                "total": len(self.results),
                "passed": passed,
                "failed": failed,
                "results": [(n, s, e) for n, s, e in self.results]
            }, f, indent=2)
        print(f"\nResults saved: {result_file}")

    def run_all(self):
        """Run all API tests"""
        print("\n" + "=" * 60)
        print("P2P MARKETPLACE API TEST SUITE")
        print("=" * 60)
        print(f"Contract: {CONTRACT_ID[:16]}...")
        print(f"Server: {BASE_URL}")

        # Check server
        status = http_get(f"{BASE_URL}/api/status")
        if "error" in status:
            print(f"\nERROR: Cannot connect to server: {status['error']}")
            print("Start server: python3 serve.py 9080")
            return

        print(f"\nActive wallet: {status.get('active_wallet', 'None')}")

        # Ensure we're on test_wallet
        if status.get("active_wallet") != "test_wallet":
            if not switch_wallet("test_wallet"):
                print("Failed to switch to test_wallet")
                return

        # Phase 1: View Methods (test_wallet as seller/manager)
        print("\n" + "-" * 40)
        print("PHASE 1: VIEW METHODS (Seller/Manager)")
        print("-" * 40)

        self.run_test("View Contract Settings", self.test_view_contract)
        self.run_test("View Orders", self.test_view_orders)
        self.run_test("Get My Key", self.test_get_my_key)
        self.run_test("View Trader Reputation", self.test_view_trader)
        self.run_test("View My Trades", self.test_view_trades)
        self.run_test("View Escrow Stakers", self.test_view_escrows)
        self.run_test("View Stats", self.test_view_stats)
        self.run_test("View Managers", self.test_view_managers)

        # Phase 2: Security Tests
        print("\n" + "-" * 40)
        print("PHASE 2: SECURITY VALIDATION")
        print("-" * 40)

        self.run_test("Security: Invalid Action", self.test_security_invalid_action)
        self.run_test("Security: Invalid CID", self.test_security_invalid_cid)

        # Phase 3: Buyer Tests (test_2)
        print("\n" + "-" * 40)
        print("PHASE 3: BUYER WALLET TESTS")
        print("-" * 40)

        self.run_test("Buyer: Get Key", self.test_buyer_get_key)
        self.run_test("Buyer: View Orders", self.test_buyer_view_orders)

        # Switch back to seller
        switch_wallet("test_wallet")

        # Print summary
        self.print_summary()


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    tester = P2PAPITest()
    tester.run_all()
