#!/usr/bin/env python3
"""
Fuddle v2 Contract Tests
========================
Tests for the per-token tournament Wordle game contract.
Requires: local node running, deployed contract, wallet-api on port 10000.

Usage:
    python3 tests/test_fuddle_contract.py
"""

import json
import sys
import time
import requests

# Configuration
WALLET_API = "http://127.0.0.1:9080/api/wallet"
FUDDLE_CID = "d08237dd9491a42383f7d01e07bf2f61be9e3e0a8a9cfc7c98a50914343644c0"

# Load shader bytes
SHADER_PATH = "shaders/fuddle_app.wasm"

def load_shader():
    try:
        with open(SHADER_PATH, "rb") as f:
            return list(f.read())
    except FileNotFoundError:
        print(f"WARNING: Shader not found at {SHADER_PATH}")
        return None

SHADER = load_shader()


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


def invoke_contract(args, create_tx=False):
    """Invoke fuddle contract with auto shader injection."""
    params = {"args": args}
    if SHADER:
        params["contract"] = SHADER
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


def fuddle_call(role, action, extra_args=""):
    """Helper: view call to fuddle contract."""
    args = f"role={role},action={action},cid={FUDDLE_CID}"
    if extra_args:
        args += "," + extra_args
    return invoke_contract(args)


def fuddle_tx(role, action, extra_args=""):
    """Helper: transaction call to fuddle contract."""
    args = f"role={role},action={action},cid={FUDDLE_CID}"
    if extra_args:
        args += "," + extra_args

    result = invoke_contract(args)

    if result and isinstance(result, dict) and "raw_data" in result:
        confirmed = rpc_call("process_invoke_data", {"data": result["raw_data"]})
        return confirmed

    if result and isinstance(result, dict) and result.get("txid") and result["txid"] != "00000000000000000000000000000000":
        return {"txid": result["txid"], "status": "submitted"}

    return result


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
    """Test shader file exists and loaded."""
    ok = SHADER is not None and len(SHADER) > 0
    results.record("shader_loaded", ok,
                   f"{len(SHADER)} bytes" if ok else "not found")
    return ok


# ==========================================================================
# Contract State Tests (v2 per-token tournaments)
# ==========================================================================

def test_contract_view():
    """Test contract settings include per-tier configuration."""
    result = fuddle_call("manager", "view")
    ok = result and "settings" in result
    if not ok:
        results.record("contract_view", False, str(result))
        return False

    s = result["settings"]
    # v2 must have per-tier fields
    has_tiers = all(f"tier{i}_asset" in s and f"tier{i}_cost" in s for i in range(3))
    has_rounds = all(f"tier{i}_round" in s for i in range(3))
    has_pools = all(f"tier{i}_pool" in s for i in range(3))

    ok = has_tiers and has_rounds and has_pools
    msg = (f"tier0: asset={s.get('tier0_asset')}, cost={s.get('tier0_cost')}, "
           f"tier1: asset={s.get('tier1_asset')}, cost={s.get('tier1_cost')}, "
           f"tier2: asset={s.get('tier2_asset')}, cost={s.get('tier2_cost')}")
    results.record("contract_view_v2_tiers", ok, msg)
    return ok


def test_tier_config():
    """Test tier assets match expected: BEAM(0), FOMO(174), BEAMX(7)."""
    result = fuddle_call("manager", "view")
    if not result or "settings" not in result:
        results.skip("tier_config", "no settings")
        return False

    s = result["settings"]
    ok = (s.get("tier0_asset") == 0 and
          s.get("tier1_asset") == 174 and
          s.get("tier2_asset") == 7)
    results.record("tier_config", ok,
                   f"tier0={s.get('tier0_asset')}, tier1={s.get('tier1_asset')}, tier2={s.get('tier2_asset')}")
    return ok


def test_view_word_counts():
    """Test viewing word counts per difficulty."""
    result = fuddle_call("manager", "view_word_counts")
    ok = result and "word_counts" in result
    if ok:
        wc = result["word_counts"]
        results.record("view_word_counts", True,
                       f"4-letter: {wc.get('len4', 0)}, 5-letter: {wc.get('len5', 0)}, 6-letter: {wc.get('len6', 0)}")
    else:
        results.record("view_word_counts", False, str(result))
    return ok


# ==========================================================================
# Tournament Tests (v2)
# ==========================================================================

def test_view_all_tournaments():
    """Test viewing all 3 tournament tiers."""
    result = fuddle_call("user", "view_all_tournaments")
    ok = result and "tournaments" in result
    if not ok:
        results.record("view_all_tournaments", False, str(result))
        return False

    tournaments = result["tournaments"]
    ok = len(tournaments) == 3
    if ok:
        for t in tournaments:
            tier = t.get("tier", "?")
            asset = t.get("tier_asset", t.get("asset", "?"))
            prize = t.get("prize_pool", 0)
            players = t.get("num_players", 0)
            results.record(f"tournament_tier_{tier}", True,
                           f"asset={asset}, prize={prize}, players={players}")
    else:
        results.record("view_all_tournaments", False,
                       f"expected 3 tournaments, got {len(tournaments)}")
    return ok


def test_view_my_tournament():
    """Test viewing player's tournament status for each tier."""
    for tier in range(3):
        result = fuddle_call("user", "view_my_tournament", f"tier={tier}")
        ok = result is not None and "error" not in result
        results.record(f"view_my_tournament_tier{tier}", ok,
                       str(result)[:80] if ok else f"error: {result}")
    return True


# ==========================================================================
# View Methods
# ==========================================================================

def test_view_games():
    """Test listing games."""
    result = fuddle_call("user", "view_games")
    ok = result and "games" in result
    if ok:
        games = result["games"]
        active = [g for g in games if g.get("status") == 0]
        results.record("view_games", True,
                       f"{len(games)} total, {len(active)} active")
    else:
        results.record("view_games", False, str(result))
    return ok


def test_view_letters():
    """Test viewing player's letter inventory."""
    result = fuddle_call("user", "view_letters")
    ok = result and "letters" in result
    if ok:
        letters = result["letters"]
        total = sum(l.get("count", 0) for l in letters)
        results.record("view_letters", True,
                       f"{len(letters)} unique letters, {total} total")
    else:
        results.record("view_letters", False, str(result))
    return ok


def test_view_my_stats():
    """Test viewing player stats."""
    result = fuddle_call("user", "view_my_stats")
    ok = result and "stats" in result
    if ok:
        s = result["stats"]
        results.record("view_my_stats", True,
                       f"played={s.get('games_played', 0)}, won={s.get('games_won', 0)}")
    else:
        results.record("view_my_stats", False, str(result))
    return ok


def test_view_leaderboard():
    """Test viewing leaderboard."""
    result = fuddle_call("user", "view_leaderboard")
    ok = result and "leaderboard" in result
    if ok:
        lb = result["leaderboard"]
        results.record("view_leaderboard", True, f"{len(lb)} entries")
    else:
        results.record("view_leaderboard", False, str(result))
    return ok


# ==========================================================================
# Transaction Tests
# ==========================================================================

def test_buy_letters():
    """Test buying specific letters (always BEAM)."""
    result = fuddle_tx("user", "buy_letters", "char_id=4,count=3")
    ok = result and "error" not in result
    results.record("buy_letters", ok,
                   "bought 3x E" if ok else f"error: {result}")
    return ok


def test_buy_lootbox():
    """Test buying a lootbox (always BEAM, random letters)."""
    result = fuddle_tx("user", "buy_lootbox", "size=0")
    ok = result and "error" not in result
    results.record("buy_lootbox", ok,
                   "bought small lootbox (24 random letters)" if ok else f"error: {result}")
    return ok


def test_create_game_with_tier():
    """Test creating a game on a specific tier (v2)."""
    # Create on tier 0 (BEAM) with 5-letter words
    result = fuddle_tx("user", "create_game", "difficulty=5,tier=0")
    ok = result and not (isinstance(result, dict) and "error" in result)
    msg = ""
    if ok:
        txid = result.get("txid", "?") if isinstance(result, dict) else "?"
        msg = f"tier=0(BEAM), difficulty=5, tx={str(txid)[:16]}..."
    else:
        msg = f"error: {result}"
    results.record("create_game_tier0", ok, msg)
    return ok


def test_submit_guess():
    """Test submitting a guess (requires active game + letters)."""
    games_result = fuddle_call("user", "view_games")
    if not games_result or "games" not in games_result:
        results.skip("submit_guess", "no games available")
        return False

    active = [g for g in games_result["games"] if g.get("status") == 0 and g.get("difficulty") == 5]
    if not active:
        results.skip("submit_guess", "no active 5-letter games")
        return False

    game_id = active[0]["id"]

    # Guess CRANE (C=2, R=17, A=0, N=13, E=4)
    result = fuddle_tx("user", "submit_guess",
                       f"game_id={game_id},g0=2,g1=17,g2=0,g3=13,g4=4,g5=0")
    ok = result and "error" not in result
    results.record("submit_guess", ok,
                   f"submitted CRANE to game #{game_id}" if ok else f"error: {result}")
    return ok


def test_donate_to_pool():
    """Test donating to a tournament tier's prize pool (v2)."""
    # Donate to tier 0 (BEAM)
    result = fuddle_tx("user", "donate_to_pool", "tier=0,amount=100000000")
    ok = result and "error" not in result
    results.record("donate_to_pool_tier0", ok,
                   "donated 1 BEAM to tier 0" if ok else f"error: {result}")
    return ok


# ==========================================================================
# Security Tests
# ==========================================================================

def test_word_not_exposed():
    """Test that the hidden word is NOT exposed in any view method."""
    games_result = fuddle_call("user", "view_games")
    if not games_result or "games" not in games_result or not games_result["games"]:
        results.skip("word_not_exposed", "no games")
        return False

    game = games_result["games"][0]
    game_detail = fuddle_call("user", "view_game", f"game_id={game['id']}")

    if not game_detail:
        results.skip("word_not_exposed", "no game detail")
        return False

    # Check that word data is not in the response
    response_str = json.dumps(game_detail)
    has_word = "word" in game_detail.get("game", {}) if isinstance(game_detail, dict) else False
    ok = not has_word
    results.record("word_not_exposed", ok,
                   "word field absent from game view" if ok else "SECURITY: word is exposed!")
    return ok


def test_game_has_tier():
    """Test that game objects include tier field (v2)."""
    games_result = fuddle_call("user", "view_games")
    if not games_result or "games" not in games_result or not games_result["games"]:
        results.skip("game_has_tier", "no games")
        return False

    game = games_result["games"][0]
    has_tier = "tier" in game
    results.record("game_has_tier", has_tier,
                   f"tier={game.get('tier', 'MISSING')}" if has_tier else "tier field missing from game")
    return has_tier


# ==========================================================================
# Main
# ==========================================================================

def main():
    print("=" * 50)
    print("Fuddle v2 Contract Tests (Per-Token Tournaments)")
    print("=" * 50)

    # Connectivity
    print("\n--- Connectivity ---")
    if not test_connection():
        print("\nFATAL: Cannot connect to wallet-api. Start it first.")
        sys.exit(1)
    test_shader_loaded()

    # Contract state (v2)
    print("\n--- Contract State (v2) ---")
    test_contract_view()
    test_tier_config()
    test_view_word_counts()

    # Tournaments (v2)
    print("\n--- Tournaments (v2) ---")
    test_view_all_tournaments()
    test_view_my_tournament()

    # View methods
    print("\n--- View Methods ---")
    test_view_games()
    test_view_letters()
    test_view_my_stats()
    test_view_leaderboard()

    # Transactions (cost BEAM!)
    print("\n--- Transaction Methods ---")
    test_buy_letters()
    time.sleep(3)
    test_buy_lootbox()
    time.sleep(3)
    test_create_game_with_tier()
    time.sleep(3)
    test_submit_guess()
    time.sleep(3)
    test_donate_to_pool()

    # Security & v2 structure
    print("\n--- Security & v2 Structure ---")
    test_word_not_exposed()
    test_game_has_tier()

    # Summary
    success = results.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
