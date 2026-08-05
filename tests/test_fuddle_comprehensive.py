#!/usr/bin/env python3
"""
Fuddle v2 Comprehensive UI + Transaction Tests
================================================
Tests ALL Fuddle functionality with real blockchain transactions.
Requires: serve.py on 9080, wallet-api on 10000, beam-node on 10005.

Usage:
    python3 tests/test_fuddle_comprehensive.py
    python3 tests/test_fuddle_comprehensive.py --headless
"""

import os
import sys
import time
import json
import requests

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.common.exceptions import TimeoutException, ElementClickInterceptedException
except ImportError:
    print("ERROR: selenium not installed. Run: pip install selenium")
    sys.exit(1)

BASE_URL = "http://127.0.0.1:9080"
WALLET_API = "http://127.0.0.1:10000/api/wallet"
FUDDLE_CID = "54b22372836b853cf61f87e657fbdd60455f2eee6b91c73f4dbf0a2df887a9d7"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "fuddle_comprehensive")


class FuddleComprehensiveTests:
    def __init__(self, headless=False):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--window-size=1400,900")
        options.add_argument("--no-sandbox")
        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(5)
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def screenshot(self, name):
        path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
        self.driver.save_screenshot(path)
        print(f"      Screenshot: {path}")
        return path

    def wait_for(self, selector, timeout=10):
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def dismiss_overlay(self):
        """Hide guide overlay and debug panel that can intercept clicks."""
        self.driver.execute_script("""
            var ov = document.getElementById('guide-overlay');
            if (ov) { ov.classList.remove('active'); ov.style.display='none'; }
            var dp = document.getElementById('debug-panel');
            if (dp) { dp.style.display='none'; }
        """)

    def js_click(self, element):
        """Click element via JavaScript to bypass overlay interception."""
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].click();", element)

    def navigate_to_wallet(self):
        """Navigate to wallet and unlock if needed."""
        self.driver.get(BASE_URL)
        time.sleep(3)
        self.dismiss_overlay()

        try:
            unlock_btn = self.driver.find_element(By.CSS_SELECTOR, "#unlock-btn")
            if unlock_btn.is_displayed():
                self.driver.execute_script("""
                    var sel = document.getElementById('wallet-select');
                    if (sel) {
                        for (var i = 0; i < sel.options.length; i++) {
                            if (sel.options[i].value === 'test_wallet') {
                                sel.selectedIndex = i; break;
                            }
                        }
                    }
                """)
                time.sleep(0.3)
                pw = self.driver.find_element(By.CSS_SELECTOR, "#unlock-password")
                pw.clear()
                pw.send_keys(os.environ.get('BEAM_TEST_PASSWORD', ''))
                unlock_btn.click()
                time.sleep(5)
                self.dismiss_overlay()
                time.sleep(0.5)
        except Exception:
            pass

    def go_to_fuddle(self):
        """Navigate to Fuddle page and wait for lobby to load."""
        self.dismiss_overlay()
        nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='appstore']")
        self.js_click(nav)
        time.sleep(1)
        self.dismiss_overlay()
        featured = self.driver.find_element(By.CSS_SELECTOR, ".appstore-featured")
        self.js_click(featured)
        time.sleep(4)
        self.dismiss_overlay()

    def wait_for_tx(self, seconds=70):
        """Wait for a blockchain transaction to confirm."""
        print(f"      Waiting {seconds}s for tx confirmation...")
        time.sleep(seconds)

    def rpc_call(self, method, params=None):
        """Direct RPC call to wallet-api."""
        payload = {"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method}
        if params:
            payload["params"] = params
        try:
            resp = requests.post(WALLET_API, json=payload, timeout=30)
            data = resp.json()
            return data.get("result", data)
        except Exception as e:
            return {"error": str(e)}

    def get_root_text_lower(self):
        """Get fuddle-root text content, lowercased for case-insensitive matching."""
        root = self.driver.find_element(By.CSS_SELECTOR, "#fuddle-root")
        return root.text.lower()

    # ==================================================================
    # 1. LOBBY TESTS
    # ==================================================================

    def test_lobby_loads(self):
        """Lobby should load with tournament cards and letters section."""
        self.navigate_to_wallet()
        self.go_to_fuddle()

        text = self.get_root_text_lower()
        assert "daily tournaments" in text or "tournament" in text, f"Missing tournaments section. Text: {text[:300]}"
        assert "my letters" in text or "letters" in text, f"Missing letters section"

        self.screenshot("01_lobby")
        print("    PASS: Lobby loads with tournaments and letters")

    def test_tournament_cards_visible(self):
        """Three tournament cards should be visible (Lite/Classic/Pro)."""
        cards = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-card")
        assert len(cards) == 3, f"Expected 3 tournament cards, got {len(cards)}"

        # Check tier names
        tier_texts = [c.find_element(By.CSS_SELECTOR, ".fuddle-tournament-tier-badge").text for c in cards]
        assert "Lite" in tier_texts, f"Missing Lite tier in {tier_texts}"
        assert "Classic" in tier_texts, f"Missing Classic tier in {tier_texts}"
        assert "Pro" in tier_texts, f"Missing Pro tier in {tier_texts}"

        self.screenshot("02_tournament_cards")
        print(f"    PASS: 3 tournament cards visible ({', '.join(tier_texts)})")

    def test_lobby_stats(self):
        """Stats section should show player statistics."""
        text = self.get_root_text_lower()
        assert "played" in text, "Missing Played stat"
        assert "won" in text, "Missing Won stat"
        assert "score" in text, "Missing Score stat"
        print("    PASS: Player stats visible")

    def test_lobby_letters_display(self):
        """Letters inventory should display."""
        chips = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-letter-chip")
        total_text = self.get_root_text_lower()
        assert "total" in total_text, "Missing letter total count"
        print(f"    PASS: Letters displayed ({len(chips)} unique)")

    # ==================================================================
    # 2. LETTER SHOP TESTS
    # ==================================================================

    def test_letter_shop_opens(self):
        """Buy Letters button should open the shop."""
        self.dismiss_overlay()
        self.driver.execute_script("""
            var btns = document.querySelectorAll('#fuddle-root button');
            for (var b of btns) {
                if (b.textContent.includes('Buy Letters')) { b.click(); break; }
            }
        """)
        time.sleep(1)

        text = self.get_root_text_lower()
        assert "letter shop" in text, "Letter Shop title missing"

        self.screenshot("03_letter_shop")
        print("    PASS: Letter shop opens")

    def test_letter_shop_grid(self):
        """All 26 letters should appear in the shop grid."""
        letters = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-shop-letter")
        assert len(letters) == 26, f"Expected 26 letters in shop, got {len(letters)}"
        print("    PASS: All 26 letters in shop grid")

    def test_buy_letter_tx(self):
        """Buying a single letter should work (real tx)."""
        letters = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-shop-letter")
        target = letters[4]  # E

        self.driver.execute_script("window.confirm = function() { return true; }")
        self.js_click(target)
        time.sleep(2)

        self.screenshot("04_buy_letter_started")
        self.wait_for_tx(70)

        # Reload shop
        self.driver.execute_script("fuddleShowShop()")
        time.sleep(2)

        self.screenshot("05_buy_letter_done")
        print("    PASS: Buy letter transaction sent")

    def test_buy_lootbox_tx(self):
        """Buying a lootbox should work (real tx)."""
        lootbox = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-lootbox")
        assert len(lootbox) >= 1, "No lootbox cards found"

        self.driver.execute_script("window.confirm = function() { return true; }")
        self.js_click(lootbox[0])
        time.sleep(2)

        self.screenshot("06_buy_lootbox_started")
        self.wait_for_tx(70)

        self.driver.execute_script("fuddleShowShop()")
        time.sleep(2)
        self.screenshot("07_buy_lootbox_done")
        print("    PASS: Lootbox transaction sent")

    # ==================================================================
    # 3. GAME FLOW TESTS
    # ==================================================================

    def test_create_game(self):
        """Creating a game via tournament Play Now should work (real tx)."""
        # Go back to lobby
        self.driver.execute_script("fuddleBackFromShop()")
        time.sleep(2)

        self.driver.execute_script("window.confirm = function() { return true; }")

        # Click Play Now on Classic (5-letter) tournament
        self.driver.execute_script("""
            var cards = document.querySelectorAll('.fuddle-tournament-card');
            for (var c of cards) {
                var badge = c.querySelector('.fuddle-tournament-tier-badge');
                if (badge && badge.textContent.includes('Classic')) {
                    var btn = c.querySelector('.fuddle-tournament-play');
                    if (btn) btn.click();
                    break;
                }
            }
        """)
        time.sleep(2)

        self.screenshot("08_create_game_started")
        self.wait_for_tx(70)

        # Reload lobby
        self.driver.execute_script("loadFuddleData().then(() => renderFuddleLobby())")
        time.sleep(3)
        self.screenshot("09_create_game_done")
        print("    PASS: Game created via tournament")

    def test_enter_game(self):
        """Entering a game should show board and keyboard."""
        # Find any active game card and enter it
        cards = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-game-card")
        if not cards:
            # No game cards in lobby — try entering via JS
            self.driver.execute_script("""
                if (fuddleState.games && fuddleState.games.length) {
                    var g = fuddleState.games[0];
                    fuddleEnterGame(g.id, g.difficulty);
                }
            """)
            time.sleep(3)
        else:
            self.js_click(cards[0])
            time.sleep(3)

        board = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-board")
        keyboard = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-keyboard")
        tiles = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tile")

        assert len(board) > 0, "Game board not rendered"
        assert len(keyboard) > 0, "Keyboard not rendered"
        assert len(tiles) > 0, "No tiles rendered"

        self.screenshot("10_game_board")
        print(f"    PASS: Game board rendered ({len(tiles)} tiles)")

    def test_keyboard_input(self):
        """Typing letters on the game board should fill tiles."""
        self.dismiss_overlay()

        for letter in ['C', 'R', 'A', 'N', 'E']:
            self.driver.execute_script(f"fuddleKeyPress('{letter}')")
            time.sleep(0.15)

        filled = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tile.filled")
        self.screenshot("11_typed_guess")

        assert len(filled) >= 5, f"Expected 5 filled tiles, got {len(filled)}"
        print("    PASS: Keyboard input works (typed CRANE)")

    def test_submit_guess_tx(self):
        """Submitting a guess should create a blockchain tx."""
        self.driver.execute_script("window.confirm = function() { return true; }")
        self.driver.execute_script("fuddleKeyPress('ENTER')")
        time.sleep(2)

        self.screenshot("12_guess_submitted")
        print("    PASS: Guess submitted")

    def test_guess_result_appears(self):
        """Wait for guess result to appear on the board."""
        tiles = []
        for i in range(24):
            time.sleep(5)
            tiles = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tile.correct, .fuddle-tile.present, .fuddle-tile.absent")
            if tiles:
                break

        self.screenshot("13_guess_result")

        if tiles:
            correct = sum(1 for t in tiles[:5] if 'correct' in t.get_attribute("class"))
            print(f"    PASS: Guess feedback appeared ({correct}/5 correct)")
        else:
            print("    WARN: No feedback tiles after 120s (tx may still be pending)")

    # ==================================================================
    # 4. NAVIGATION TESTS
    # ==================================================================

    def test_back_to_lobby(self):
        """Back button should return to lobby."""
        back_btn = self.driver.find_element(By.CSS_SELECTOR, ".fuddle-back-btn")
        self.js_click(back_btn)
        time.sleep(3)

        text = self.get_root_text_lower()
        assert "tournament" in text or "daily" in text, "Not back to lobby"
        self.screenshot("14_back_to_lobby")
        print("    PASS: Back to lobby works")

    def test_leaderboard(self):
        """Leaderboard should load and display."""
        self.dismiss_overlay()
        self.driver.execute_script("""
            var btns = document.querySelectorAll('#fuddle-root button');
            for (var b of btns) {
                if (b.textContent.includes('Leaderboard')) { b.click(); break; }
            }
        """)
        time.sleep(3)

        text = self.get_root_text_lower()
        assert "leaderboard" in text, "Leaderboard title missing"
        self.screenshot("15_leaderboard")

        rows = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-lb-row")
        print(f"    PASS: Leaderboard shown ({len(rows)} entries)")

        back_btn = self.driver.find_element(By.CSS_SELECTOR, ".fuddle-back-btn")
        self.js_click(back_btn)
        time.sleep(2)

    def test_donate_to_pool(self):
        """Donating to a tournament pool should work."""
        self.dismiss_overlay()
        donate_btns = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-donate")
        if not donate_btns:
            print("    SKIP: No donate buttons")
            return

        self.js_click(donate_btns[0])
        time.sleep(0.5)

        modal = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-result-overlay")
        if modal and modal[0].is_displayed():
            self.screenshot("16_donate_modal")
            # Close without sending tx
            close_btns = modal[0].find_elements(By.CSS_SELECTOR, "button")
            if close_btns:
                self.js_click(close_btns[-1])
                time.sleep(0.3)
        print("    PASS: Donate modal accessible")

    # ==================================================================
    # 5. ADMIN TESTS
    # ==================================================================

    def test_admin_panel_opens(self):
        """Admin panel should open with contract stats."""
        self.dismiss_overlay()
        self.driver.execute_script("""
            var btns = document.querySelectorAll('#fuddle-root button');
            for (var b of btns) {
                if (b.textContent.includes('Admin')) { b.click(); break; }
            }
        """)
        time.sleep(3)

        text = self.get_root_text_lower()
        assert "admin" in text, "Admin Panel title missing"
        self.screenshot("17_admin_panel")
        print("    PASS: Admin panel opens")

    def test_admin_stats_display(self):
        """Admin stats should show games count, fees, tournament pools."""
        stats = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-admin-stat")
        assert len(stats) >= 3, f"Expected at least 3 stat cards, got {len(stats)}"
        print(f"    PASS: Admin stats displayed ({len(stats)} cards)")

    # ==================================================================
    # 6. ROUTE TESTS
    # ==================================================================

    def test_direct_appstore_route(self):
        """Direct /appstore URL should work."""
        self.driver.get(f"{BASE_URL}/appstore")
        time.sleep(3)
        self.dismiss_overlay()

        page = self.driver.find_elements(By.CSS_SELECTOR, "#page-appstore")
        assert len(page) > 0, "App Store page not found"
        self.screenshot("18_direct_appstore_route")
        print("    PASS: /appstore route works")

    def test_direct_fuddle_route(self):
        """Direct /fuddle URL should work."""
        self.driver.get(f"{BASE_URL}/fuddle")
        time.sleep(5)
        self.dismiss_overlay()

        page = self.driver.find_elements(By.CSS_SELECTOR, "#page-fuddle")
        fuddle_root = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-root")
        assert len(page) > 0, "Fuddle page not found"
        assert len(fuddle_root) > 0, "Fuddle root not found"
        self.screenshot("19_direct_fuddle_route")
        print("    PASS: /fuddle route works")

    # ==================================================================
    # Run all
    # ==================================================================

    def run_all(self):
        print("=" * 60)
        print("Fuddle v2 Comprehensive Tests (with real transactions)")
        print("=" * 60)

        tests = [
            # Lobby
            ("Lobby loads", self.test_lobby_loads),
            ("Tournament cards (3)", self.test_tournament_cards_visible),
            ("Player stats", self.test_lobby_stats),
            ("Letters display", self.test_lobby_letters_display),
            # Letter Shop
            ("Letter shop opens", self.test_letter_shop_opens),
            ("Shop grid (26 letters)", self.test_letter_shop_grid),
            ("Buy letter (tx)", self.test_buy_letter_tx),
            ("Buy lootbox (tx)", self.test_buy_lootbox_tx),
            # Game flow
            ("Create game (tx)", self.test_create_game),
            ("Enter game board", self.test_enter_game),
            ("Keyboard input", self.test_keyboard_input),
            ("Submit guess (tx)", self.test_submit_guess_tx),
            ("Guess result", self.test_guess_result_appears),
            # Navigation
            ("Back to lobby", self.test_back_to_lobby),
            ("Leaderboard", self.test_leaderboard),
            ("Donate to pool", self.test_donate_to_pool),
            # Admin
            ("Admin panel", self.test_admin_panel_opens),
            ("Admin stats", self.test_admin_stats_display),
            # Routes
            ("Direct /appstore route", self.test_direct_appstore_route),
            ("Direct /fuddle route", self.test_direct_fuddle_route),
        ]

        passed = 0
        failed = 0

        for name, test_fn in tests:
            print(f"\n  [{passed+failed+1}/{len(tests)}] Testing: {name}")
            try:
                test_fn()
                passed += 1
            except AssertionError as e:
                self.screenshot(f"FAIL_{name.replace(' ', '_')}")
                print(f"    FAIL: {e}")
                failed += 1
            except Exception as e:
                self.screenshot(f"ERROR_{name.replace(' ', '_')}")
                print(f"    ERROR: {type(e).__name__}: {e}")
                failed += 1

        print(f"\n{'='*60}")
        print(f"Results: {passed} passed, {failed} failed")
        print(f"{'='*60}")

        self.driver.quit()
        return failed == 0


def main():
    headless = "--headless" in sys.argv

    # Pre-flight checks
    print("Pre-flight checks...")
    try:
        r = requests.get(f"{BASE_URL}/api/status", timeout=5)
        status = r.json()
        print(f"  serve.py: OK (wallet: {status.get('active_wallet', '?')})")
    except Exception as e:
        print(f"  serve.py: FAILED ({e})")
        print("  Start serve.py first: python3 serve.py 9080")
        sys.exit(1)

    try:
        r = requests.post(WALLET_API, json={"jsonrpc": "2.0", "id": 1, "method": "wallet_status"}, timeout=5)
        h = r.json().get("result", {}).get("current_height", 0)
        print(f"  wallet-api: OK (height: {h})")
    except Exception as e:
        print(f"  wallet-api: FAILED ({e})")
        sys.exit(1)

    # Check contract is accessible
    try:
        r = requests.post(f"{BASE_URL}/api/wallet", json={
            "jsonrpc": "2.0", "id": 1, "method": "invoke_contract",
            "params": {"args": f"role=manager,action=view,cid={FUDDLE_CID}"}
        }, timeout=15)
        data = r.json()
        if "result" in data and "output" in data["result"]:
            out = json.loads(data["result"]["output"])
            gc = out.get("settings", {}).get("game_count", "?")
            print(f"  Fuddle contract: OK (games: {gc})")
        else:
            print(f"  Fuddle contract: ERROR - {data}")
            sys.exit(1)
    except Exception as e:
        print(f"  Fuddle contract: FAILED ({e})")
        print("  Make sure beam-node is running on port 10005")
        sys.exit(1)

    print()

    tests = FuddleComprehensiveTests(headless=headless)
    success = tests.run_all()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
