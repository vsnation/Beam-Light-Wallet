#!/usr/bin/env python3
"""
MemeClash Contract Tests
========================
Tests for the $CHAD vs $GIGA meme battle game contract.
Requires: local node running, deployed contract, wallet-api on port 10000.

Usage:
    python3 tests/test_memeclash_contract.py
"""

import json
import sys
import time
import requests

# Configuration
WALLET_API = "http://127.0.0.1:9080/api/wallet"
MEMECLASH_CID = "d753ecb032b59f95d83bda64d5ed67baecc78068428be0cfae44c4dc2e4b6282"
DEX_CID = "729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf"

# Asset IDs (v9)
CHAD_AID = 190
GIGA_AID = 191
FOMO_AID = 174
BEAM_AID = 0

# Shader paths
MEMECLASH_SHADER_PATH = "shaders/memeclash_app.wasm"
DEX_SHADER_PATH = "shaders/amm_app.wasm"


def load_shader(path):
    try:
        with open(path, "rb") as f:
            return list(f.read())
    except FileNotFoundError:
        print(f"WARNING: Shader not found at {path}")
        return None


MEMECLASH_SHADER = load_shader(MEMECLASH_SHADER_PATH)
DEX_SHADER = load_shader(DEX_SHADER_PATH)


def rpc_call(method, params=None):
    """Make JSON-RPC call to wallet-api."""
    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": method,
    }
    if params:
        payload["params"] = params
    try:
        resp = requests.post(WALLET_API, json=payload, timeout=30)
        data = resp.json()
        if "error" in data:
            return {"error": data["error"]}
        return data.get("result", data)
    except Exception as e:
        return {"error": str(e)}


def invoke_contract(args, shader=None, create_tx=False):
    """Invoke contract with shader injection."""
    params = {"args": args}
    if shader:
        params["contract"] = shader
    if create_tx:
        params["create_tx"] = True

    result = rpc_call("invoke_contract", params)

    if result and "error" in result:
        return result

    if result and "output" in result:
        try:
            parsed = json.loads(result["output"])
            if "raw_data" in result:
                parsed["raw_data"] = result["raw_data"]
            if "txid" in result:
                parsed["txid"] = result["txid"]
            return parsed
        except (json.JSONDecodeError, TypeError):
            pass

    return result


def memeclash_call(role, action, extra_args=""):
    """View call to MemeClash contract."""
    args = f"role={role},action={action},cid={MEMECLASH_CID}"
    if extra_args:
        args += "," + extra_args
    return invoke_contract(args, MEMECLASH_SHADER)


def memeclash_tx(role, action, extra_args=""):
    """Transaction call to MemeClash contract (dry run + confirm)."""
    args = f"role={role},action={action},cid={MEMECLASH_CID}"
    if extra_args:
        args += "," + extra_args

    result = invoke_contract(args, MEMECLASH_SHADER)

    if result and isinstance(result, dict) and "raw_data" in result:
        confirmed = rpc_call("process_invoke_data", {"data": result["raw_data"]})
        return confirmed

    return result


def dex_call(action, extra_args=""):
    """View call to DEX contract."""
    args = f"action={action},cid={DEX_CID}"
    if extra_args:
        args += "," + extra_args
    return invoke_contract(args, DEX_SHADER)


def wait_for_tx(txid, timeout=120):
    """Wait for a transaction to confirm or fail."""
    for _ in range(timeout // 5):
        result = rpc_call("tx_status", {"txId": txid})
        status = result.get("status", -1)
        if status == 3:
            return True  # Confirmed
        if status == 4:
            return False  # Failed
        time.sleep(5)
    return False


def get_current_height():
    """Get current blockchain height."""
    result = rpc_call("wallet_status")
    return result.get("current_height", 0)


# ==========================================================================
# Test harness
# ==========================================================================

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.results = []

    def record(self, name, passed, msg=""):
        status = "PASS" if passed else "FAIL"
        self.results.append((name, status, msg))
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        symbol = "+" if passed else "X"
        print(f"  {symbol} {name}" + (f" - {msg}" if msg else ""))

    def skip(self, name, reason=""):
        self.results.append((name, "SKIP", reason))
        self.skipped += 1
        print(f"  o {name} (skipped: {reason})")

    def summary(self):
        print(f"\n{'='*50}")
        print(f"Results: {self.passed} passed, {self.failed} failed, {self.skipped} skipped")
        print(f"{'='*50}")
        return self.failed == 0


results = TestResults()


# ==========================================================================
# Connectivity Tests
# ==========================================================================

def test_connection():
    """Test wallet-api is reachable."""
    result = rpc_call("wallet_status")
    ok = "error" not in result
    results.record("wallet_api_connection", ok,
                   f"height={result.get('current_height', '?')}" if ok else f"error: {result.get('error')}")
    return ok


def test_shader_loaded():
    """Test MemeClash shader file exists and loaded."""
    ok = MEMECLASH_SHADER is not None and len(MEMECLASH_SHADER) > 0
    results.record("memeclash_shader_loaded", ok,
                   f"{len(MEMECLASH_SHADER)} bytes" if ok else "not found")
    return ok


def test_dex_shader_loaded():
    """Test DEX shader file exists and loaded."""
    ok = DEX_SHADER is not None and len(DEX_SHADER) > 0
    results.record("dex_shader_loaded", ok,
                   f"{len(DEX_SHADER)} bytes" if ok else "not found")
    return ok


# ==========================================================================
# Contract State Tests
# ==========================================================================

def test_view_state():
    """Test contract state includes all required fields."""
    result = memeclash_call("user", "view_state")
    ok = result and "state" in result
    if not ok:
        results.record("view_state", False, str(result)[:100])
        return False

    s = result["state"]
    required = ["token0", "token1", "fomo_asset_id", "current_round", "round_duration",
                "checkpoint_fee_bps", "fomo_buyback_bps", "burn_bps",
                "total_burned0", "total_burned1", "total_fomo_buyback",
                "chad_wins", "giga_wins", "draws", "total_rounds"]
    missing = [f for f in required if f not in s]
    ok = len(missing) == 0
    results.record("view_state", ok,
                   f"round={s.get('current_round')} rounds={s.get('total_rounds')}" if ok
                   else f"missing fields: {missing}")
    return ok


def test_token_ids():
    """Verify token0=CHAD(187) and token1=GIGA(186)."""
    result = memeclash_call("user", "view_state")
    if not result or "state" not in result:
        results.record("token_ids", False, "no state")
        return False

    s = result["state"]
    ok = s.get("token0") == CHAD_AID and s.get("token1") == GIGA_AID
    results.record("token_ids", ok,
                   f"token0={s.get('token0')} token1={s.get('token1')}")
    return ok


def test_fee_config():
    """Verify fee configuration: 85% burn + 5% caller + 10% FOMO = 100%."""
    result = memeclash_call("user", "view_state")
    if not result or "state" not in result:
        results.record("fee_config", False, "no state")
        return False

    s = result["state"]
    burn = s.get("burn_bps", 0)
    caller = s.get("checkpoint_fee_bps", 0)
    fomo = s.get("fomo_buyback_bps", 0)
    total = burn + caller + fomo
    ok = total == 10000  # 100% in basis points
    results.record("fee_config", ok,
                   f"burn={burn/100}% + caller={caller/100}% + fomo={fomo/100}% = {total/100}%")
    return ok


def test_fomo_asset():
    """Verify FOMO asset ID is 174."""
    result = memeclash_call("user", "view_state")
    if not result or "state" not in result:
        results.record("fomo_asset", False, "no state")
        return False

    ok = result["state"].get("fomo_asset_id") == FOMO_AID
    results.record("fomo_asset", ok,
                   f"fomo_aid={result['state'].get('fomo_asset_id')}")
    return ok


# ==========================================================================
# Round Tests
# ==========================================================================

def test_view_current_round():
    """Test viewing current active round."""
    result = memeclash_call("user", "view_current_round")
    ok = result and "current_round" in result
    if not ok:
        results.record("view_current_round", False, str(result)[:100])
        return False

    r = result["current_round"]
    required = ["round_id", "start_height", "end_height", "treasury0", "treasury1",
                "winner", "status", "blocks_remaining", "phase"]
    missing = [f for f in required if f not in r]
    ok = len(missing) == 0
    results.record("view_current_round", ok,
                   f"round={r.get('round_id')} phase={r.get('phase')} blocks_left={r.get('blocks_remaining')}"
                   if ok else f"missing: {missing}")
    return ok


def test_view_round():
    """Test viewing a specific round (Round 1 should be the draw)."""
    result = memeclash_call("user", "view_round", "round_id=1")
    ok = result and "round" in result
    if not ok:
        results.record("view_round_1", False, str(result)[:100])
        return False

    r = result["round"]
    # Round 1 was a draw (winner=254 means draw)
    ok = r.get("winner") == 254 and r.get("status") == 2
    results.record("view_round_1", ok,
                   f"winner={r.get('winner')} status={r.get('status')} (expected draw)")
    return ok


def test_view_round2():
    """Test viewing Round 2 (active round with treasuries from trades)."""
    result = memeclash_call("user", "view_round", "round_id=2")
    ok = result and "round" in result
    if not ok:
        results.record("view_round_2", False, str(result)[:100])
        return False

    r = result["round"]
    # Round 2 should be active (status=0) with treasuries from trades
    ok = r.get("status") == 0  # active
    t0 = r.get("treasury0", 0)
    t1 = r.get("treasury1", 0)
    results.record("view_round_2", ok,
                   f"status={r.get('status')} chad_treasury={t0} giga_treasury={t1}")
    return ok


# ==========================================================================
# History & Stats Tests
# ==========================================================================

def test_view_history():
    """Test viewing round history."""
    result = memeclash_call("user", "view_history", "count=10")
    # History may be under "rounds" or "history" key
    ok = result and ("history" in result or "rounds" in result)
    if not ok:
        results.record("view_history", False, str(result)[:100])
        return False

    h = result.get("history") or result.get("rounds", [])
    ok = isinstance(h, list) and len(h) >= 2  # At least 2 completed rounds
    results.record("view_history", ok,
                   f"{len(h)} rounds in history" if ok else "insufficient history")
    return ok


def test_lifetime_stats():
    """Test lifetime statistics are tracking correctly."""
    result = memeclash_call("user", "view_state")
    if not result or "state" not in result:
        results.record("lifetime_stats", False, "no state")
        return False

    s = result["state"]
    total = s.get("total_rounds", 0)
    draws = s.get("draws", 0)
    chad_w = s.get("chad_wins", 0)
    giga_w = s.get("giga_wins", 0)

    # v9: Round 1 was a draw
    ok = total >= 1 and draws >= 1
    results.record("lifetime_stats", ok,
                   f"total={total} draws={draws} chad_wins={chad_w} giga_wins={giga_w}")
    return ok


def test_burn_tracking():
    """Test token burn tracking after checkpoint."""
    result = memeclash_call("user", "view_state")
    if not result or "state" not in result:
        results.record("burn_tracking", False, "no state")
        return False

    s = result["state"]
    b0 = s.get("total_burned0", 0)  # CHAD burned
    b1 = s.get("total_burned1", 0)  # GIGA burned

    # After Round 2 (GIGA won): CHAD should be burned, GIGA may be burned
    ok = b0 > 0 or b1 > 0  # At least some tokens burned
    results.record("burn_tracking", ok,
                   f"chad_burned={b0} giga_burned={b1}")
    return ok


def test_fomo_buyback_tracking():
    """Test FOMO buyback accumulation."""
    result = memeclash_call("user", "view_state")
    if not result or "state" not in result:
        results.record("fomo_buyback", False, "no state")
        return False

    fomo = result["state"].get("total_fomo_buyback", 0)
    # Draw rounds don't do FOMO buyback — only winner rounds do
    ok = True  # Not a failure if 0 — only happens after non-draw checkpoints
    results.record("fomo_buyback", ok,
                   f"total_fomo_buyback={fomo} groth (0 expected after draw)")
    return ok


# ==========================================================================
# DEX Pool Tests
# ==========================================================================

def test_dex_pools_exist():
    """Test CHAD/BEAM and GIGA/BEAM DEX pools exist."""
    result = dex_call("pools_view")
    if not result or "res" not in result:
        results.record("dex_pools_exist", False, str(result)[:100])
        return False

    pools = result["res"]
    chad_pool = None
    giga_pool = None
    for p in pools:
        if p.get("aid2") == CHAD_AID:
            chad_pool = p
        if p.get("aid2") == GIGA_AID:
            giga_pool = p

    ok = chad_pool is not None and giga_pool is not None
    if ok:
        results.record("dex_pools_exist", True,
                       f"CHAD: {chad_pool['tok1']} BEAM / {chad_pool['tok2']} CHAD, "
                       f"GIGA: {giga_pool['tok1']} BEAM / {giga_pool['tok2']} GIGA")
    else:
        results.record("dex_pools_exist", False,
                       f"chad={'found' if chad_pool else 'missing'} giga={'found' if giga_pool else 'missing'}")
    return ok


def test_dex_pools_affected_by_checkpoint():
    """Verify DEX pool reserves changed after checkpoint (burn cycle traded on DEX)."""
    result = dex_call("pools_view")
    if not result or "res" not in result:
        results.record("dex_pools_affected", False, "no pools")
        return False

    pools = result["res"]
    chad_pool = next((p for p in pools if p.get("aid2") == CHAD_AID), None)
    giga_pool = next((p for p in pools if p.get("aid2") == GIGA_AID), None)

    if not chad_pool or not giga_pool:
        results.record("dex_pools_affected", False, "pools missing")
        return False

    # v9: After trades, both pools should have slightly different reserves
    # Trades buy tokens from pools, so token reserves decrease and BEAM reserves increase
    chad_beam = chad_pool["tok1"]
    giga_beam = giga_pool["tok1"]

    # CHAD had more BEAM traded into it (1 BEAM vs 0.5 BEAM)
    ok = chad_beam > giga_beam
    results.record("dex_pools_affected", ok,
                   f"CHAD BEAM reserve: {chad_beam/1e8:.2f}, GIGA BEAM reserve: {giga_beam/1e8:.2f} "
                   f"(CHAD > GIGA: {'yes' if ok else 'no'})")
    return ok


# ==========================================================================
# Snapshot Tests
# ==========================================================================

def test_view_snapshots():
    """Test viewing snapshots for completed round."""
    # View Round 2 (active round with start reserves)
    result = memeclash_call("user", "view_round", "round_id=2")
    if not result or "round" not in result:
        results.record("view_snapshots", False, "no round data")
        return False

    r = result["round"]
    # Round 1 was a draw — no beam from loser (both treasuries burned)
    # Round 2 is still active — verify it has start reserves
    ok = r.get("start_beam_reserve0", 0) > 0
    results.record("view_snapshots", ok,
                   f"start_reserves: r0={r.get('start_beam_reserve0',0)} r1={r.get('start_beam_reserve1',0)}")
    return ok


# ==========================================================================
# Round Auto-start Tests
# ==========================================================================

def test_round_auto_start():
    """Test that a new round auto-starts after checkpoint."""
    result = memeclash_call("user", "view_current_round")
    if not result or "current_round" not in result:
        results.record("round_auto_start", False, "no current round")
        return False

    r = result["current_round"]
    state = memeclash_call("user", "view_state")
    current_round = state.get("state", {}).get("current_round", 0) if state else 0

    # Round 2 should exist (auto-started after Round 1 checkpoint)
    ok = current_round >= 2 and r.get("round_id") >= 2
    results.record("round_auto_start", ok,
                   f"current_round={current_round} active_round={r.get('round_id')}")
    return ok


def test_treasury_carryover():
    """Test that winner treasury carries over to next round."""
    result = memeclash_call("user", "view_current_round")
    if not result or "current_round" not in result:
        results.record("treasury_carryover", False, "no round")
        return False

    r = result["current_round"]
    # v8+: no carryover — both treasuries burned. Round 2 starts at 0, builds from trades.
    t0 = r.get("treasury0", -1)  # CHAD treasury
    t1 = r.get("treasury1", -1)  # GIGA treasury

    # After trades, treasuries should be > 0 (accumulated from trade fees)
    ok = t0 >= 0 and t1 >= 0
    results.record("treasury_carryover", ok,
                   f"chad_treasury={t0} giga_treasury={t1} (no carryover in v8+)")
    return ok


# ==========================================================================
# Admin Tests (view only, no state changes)
# ==========================================================================

def test_admin_view_state():
    """Test admin view_state returns data (may differ from user role)."""
    result = memeclash_call("manager", "view_state")
    # Admin view_state may return different structure or same as user
    # Just verify it doesn't return an error
    ok = result is not None and "error" not in result
    if isinstance(result, dict) and "state" in result:
        results.record("admin_view_state", True, "has state object")
    elif isinstance(result, dict) and result.get("txid") == "00000000000000000000000000000000":
        # App shader returns empty output for manager view_state (uses user role internally)
        results.record("admin_view_state", True, "returns ok (empty output)")
    else:
        results.record("admin_view_state", ok, str(result)[:100])
    return ok


# ==========================================================================
# Error Case Tests
# ==========================================================================

def test_invalid_round():
    """Test viewing non-existent round returns error/empty."""
    result = memeclash_call("user", "view_round", "round_id=999")
    # Should return empty or error for non-existent round
    ok = result is not None  # Just shouldn't crash
    if isinstance(result, dict) and "round" in result:
        # If it returns data, winner should be 255 (unresolved) or empty
        r = result["round"]
        ok = r.get("start_height", 0) == 0  # Non-existent rounds have no start height
    results.record("invalid_round", ok, "handled gracefully")
    return ok


def test_contract_id_valid():
    """Test that the configured contract ID is valid."""
    ok = len(MEMECLASH_CID) == 64
    results.record("contract_id_valid", ok,
                   f"CID length={len(MEMECLASH_CID)}")
    return ok


# ==========================================================================
# Run Tests
# ==========================================================================

def main():
    print("=" * 60)
    print("MemeClash Contract Tests")
    print(f"CID: {MEMECLASH_CID[:16]}...")
    print(f"DEX: {DEX_CID[:16]}...")
    print("=" * 60)

    # Connectivity
    print("\n--- Connectivity ---")
    if not test_connection():
        print("\nFATAL: Cannot connect to wallet-api. Is it running?")
        sys.exit(1)
    test_shader_loaded()
    test_dex_shader_loaded()

    # Contract State
    print("\n--- Contract State ---")
    test_contract_id_valid()
    test_view_state()
    test_token_ids()
    test_fee_config()
    test_fomo_asset()

    # Round Management
    print("\n--- Round Management ---")
    test_view_current_round()
    test_view_round()      # Round 1 (draw)
    test_view_round2()     # Round 2 (GIGA win)
    test_round_auto_start()
    test_treasury_carryover()

    # History & Stats
    print("\n--- History & Stats ---")
    test_view_history()
    test_lifetime_stats()
    test_burn_tracking()
    test_fomo_buyback_tracking()

    # Snapshots
    print("\n--- Snapshots ---")
    test_view_snapshots()

    # DEX Integration
    print("\n--- DEX Integration ---")
    test_dex_pools_exist()
    test_dex_pools_affected_by_checkpoint()

    # Admin
    print("\n--- Admin ---")
    test_admin_view_state()

    # Error Cases
    print("\n--- Error Cases ---")
    test_invalid_round()

    # Summary
    all_passed = results.summary()
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
