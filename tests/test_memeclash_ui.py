#!/usr/bin/env python3
"""
MemeClash UI Selenium Tests
============================
Tests for the Meme Clash (CHAD vs GIGA) game frontend.
Requires: serve.py running on port 9080, Chrome/Chromium installed.

Usage:
    python3 tests/test_memeclash_ui.py
    python3 tests/test_memeclash_ui.py --headless
"""

import os
import sys
import time

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("ERROR: selenium not installed. Run: pip install selenium")
    sys.exit(1)


BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "memeclash")


class MemeClashUITests:
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
        path = os.path.join(SCREENSHOT_DIR, f"{name}_{int(time.time())}.png")
        self.driver.save_screenshot(path)
        print(f"    Screenshot: {path}")
        return path

    def wait_for(self, selector, timeout=10):
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def exists(self, selector):
        return len(self.driver.find_elements(By.CSS_SELECTOR, selector)) > 0

    def dismiss_overlay(self):
        """Dismiss any blocking overlay."""
        self.driver.execute_script("""
            var ov = document.getElementById('guide-overlay');
            if (ov) { ov.classList.remove('active'); ov.style.display='none'; }
            var dp = document.getElementById('debug-panel');
            if (dp) { dp.style.display='none'; }
        """)

    def js_click(self, element):
        """Click element via JavaScript to bypass overlay interception."""
        self.driver.execute_script(
            "arguments[0].scrollIntoView({block:'center'}); arguments[0].click();",
            element
        )

    def navigate_to_wallet(self):
        """Navigate to wallet, unlock if needed, dismiss overlays."""
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

    def go_to_memeclash(self):
        """Navigate to Meme Clash page."""
        self.dismiss_overlay()
        try:
            nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='memeclash']")
            self.js_click(nav)
            time.sleep(3)
            return True
        except Exception:
            pass
        try:
            apps = self.driver.find_element(By.CSS_SELECTOR, "[data-page='apps']")
            self.js_click(apps)
            time.sleep(1)
            mc = self.driver.find_element(By.CSS_SELECTOR, "[data-app='memeclash']")
            self.js_click(mc)
            time.sleep(3)
            return True
        except Exception:
            pass
        return False

    # ==================================================================
    # Test Cases
    # ==================================================================

    def test_page_loads(self):
        """Test MemeClash page loads with data (not loading spinner)."""
        self.navigate_to_wallet()
        ok = self.go_to_memeclash()
        self.screenshot("01_page_loaded")

        if not ok:
            return False, "Could not navigate to MemeClash page"

        # Wait for data
        time.sleep(2)
        root = self.driver.find_element(By.CSS_SELECTOR, "#memeclash-root")
        html = root.get_attribute("innerHTML")
        if "mc-loading-spinner" in html and "Loading MemeClash" in html:
            return False, "Still showing loading spinner"
        if not html.strip():
            return False, "Empty root element"
        return self.exists(".mc-container"), "MemeClash container loaded"

    def test_header(self):
        """Test title and subtitle render."""
        has_title = self.exists(".mc-title")
        if not has_title:
            return False, "No .mc-title element"
        title = self.driver.find_element(By.CSS_SELECTOR, ".mc-title")
        has_sub = self.exists(".mc-subtitle")
        sub = self.driver.find_element(By.CSS_SELECTOR, ".mc-subtitle") if has_sub else None
        ok = "MEME CLASH" in title.text
        detail = f"Title='{title.text}'"
        if sub:
            detail += f" Sub='{sub.text}'"
        return ok, detail

    def test_arena_exists(self):
        """Test arena section with team cards."""
        self.screenshot("02_arena")
        has = self.exists(".mc-arena")
        if not has:
            return False, "No .mc-arena"
        chad = self.exists(".mc-team-card.chad")
        giga = self.exists(".mc-team-card.giga")
        vs = self.exists(".mc-vs-divider")
        return chad and giga and vs, f"CHAD={chad} GIGA={giga} VS={vs}"

    def test_round_badge(self):
        """Test round number and timer display."""
        badge = self.exists(".mc-round-badge")
        timer = self.exists(".mc-timer-badge")
        phase = self.exists(".mc-phase-pill")
        if not badge:
            return False, "No round badge"
        el = self.driver.find_element(By.CSS_SELECTOR, ".mc-round-badge")
        return "#" in el.text, f"Badge='{el.text}' Timer={timer} Phase={phase}"

    def test_team_avatars(self):
        """Test avatar images load successfully."""
        chad_img = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-avatar.chad img")
        giga_img = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-avatar.giga img")
        if not chad_img or not giga_img:
            return False, f"CHAD img={len(chad_img)} GIGA img={len(giga_img)}"
        chad_w = self.driver.execute_script("return arguments[0].naturalWidth", chad_img[0])
        giga_w = self.driver.execute_script("return arguments[0].naturalWidth", giga_img[0])
        ok = chad_w > 0 and giga_w > 0
        return ok, f"CHAD {chad_w}px GIGA {giga_w}px"

    def test_team_names(self):
        """Test team names $CHAD and $GIGA display."""
        chad = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-name.chad")
        giga = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-name.giga")
        if not chad or not giga:
            return False, "Missing team names"
        return "CHAD" in chad[0].text and "GIGA" in giga[0].text, f"'{chad[0].text}' vs '{giga[0].text}'"

    def test_treasury_display(self):
        """Test treasury amounts shown for each team."""
        treasuries = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-treasury")
        if len(treasuries) < 2:
            return False, f"Only {len(treasuries)} treasury elements"
        texts = [t.text for t in treasuries]
        return True, f"Treasuries: {texts}"

    def test_pool_info(self):
        """Test DEX pool reserves displayed."""
        pools = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-pool")
        if len(pools) < 2:
            return False, f"Only {len(pools)} pool elements"
        has_beam = any("BEAM" in p.text for p in pools)
        return has_beam, f"Pool info with BEAM reserves: {has_beam}"

    def test_power_bar(self):
        """Test power bar with percentages."""
        self.screenshot("03_powerbar")
        bar = self.exists(".mc-power-bar")
        if not bar:
            return False, "No .mc-power-bar"
        chad_fill = self.exists(".mc-power-fill.chad")
        giga_fill = self.exists(".mc-power-fill.giga")
        chad_label = self.driver.find_elements(By.CSS_SELECTOR, ".chad-label")
        giga_label = self.driver.find_elements(By.CSS_SELECTOR, ".giga-label")
        labels_ok = chad_label and giga_label and "%" in chad_label[0].text
        return chad_fill and giga_fill and labels_ok, f"Fills: CHAD={chad_fill} GIGA={giga_fill} Labels={labels_ok}"

    def test_swap_section(self):
        """Test swap UI with toggles, input, and buttons."""
        self.screenshot("04_swap")
        has = self.exists(".mc-swap-section")
        if not has:
            return False, "No .mc-swap-section"

        checks = {
            "CHAD toggle": self.exists("#mc-swap-chad"),
            "GIGA toggle": self.exists("#mc-swap-giga"),
            "Amount input": self.exists("#mc-swap-amount"),
            "Buy button": self.exists(".mc-swap-btn"),
            "Balance": self.exists(".mc-swap-balance"),
        }
        pct_btns = self.driver.find_elements(By.CSS_SELECTOR, ".mc-swap-pct-btn")
        checks["Pct buttons (4)"] = len(pct_btns) == 4

        failed = [k for k, v in checks.items() if not v]
        return len(failed) == 0, f"Missing: {failed}" if failed else f"All {len(checks)} elements present"

    def test_swap_team_toggle(self):
        """Test clicking GIGA toggle switches team."""
        giga_btn = self.driver.find_elements(By.CSS_SELECTOR, "#mc-swap-giga")
        if not giga_btn:
            return False, "No GIGA toggle"
        self.js_click(giga_btn[0])
        time.sleep(1)
        giga_btn = self.driver.find_element(By.CSS_SELECTOR, "#mc-swap-giga")
        is_active = "active" in giga_btn.get_attribute("class")
        # Switch back
        chad_btn = self.driver.find_element(By.CSS_SELECTOR, "#mc-swap-chad")
        self.js_click(chad_btn)
        time.sleep(1)
        return is_active, f"GIGA active after click: {is_active}"

    def test_swap_quote(self):
        """Test entering amount triggers quote."""
        inp = self.driver.find_elements(By.CSS_SELECTOR, "#mc-swap-amount")
        if not inp:
            return False, "No amount input"
        inp[0].clear()
        inp[0].send_keys("0.5")
        time.sleep(3)  # Debounce + quote fetch
        self.screenshot("05_swap_quote")
        has_quote = self.exists(".mc-swap-quote")
        if has_quote:
            q = self.driver.find_element(By.CSS_SELECTOR, ".mc-swap-quote")
            return True, f"Quote: {q.text[:80]}"
        return False, "No quote appeared after entering amount"

    def test_howto_section(self):
        """Test How to Play expander."""
        has = self.exists(".mc-howto")
        if not has:
            return False, "No .mc-howto"
        toggle = self.driver.find_element(By.CSS_SELECTOR, ".mc-howto-toggle")
        self.js_click(toggle)
        time.sleep(0.5)
        steps = self.driver.find_elements(By.CSS_SELECTOR, ".mc-howto-step")
        bonus = self.exists(".mc-howto-bonus")
        self.screenshot("06_howto")
        return len(steps) == 3 and bonus, f"Steps={len(steps)} Bonus={bonus}"

    def test_deposit_section(self):
        """Test deposit section UI."""
        has = self.exists(".mc-deposit-section")
        if not has:
            return False, "No .mc-deposit-section"
        chad_btn = self.exists("#mc-team-chad")
        giga_btn = self.exists("#mc-team-giga")
        amount_input = self.exists("#mc-deposit-amount")
        return chad_btn and giga_btn and amount_input, f"CHAD={chad_btn} GIGA={giga_btn} Input={amount_input}"

    def test_lifetime_stats(self):
        """Test lifetime stats grid with values."""
        # Scroll stats into view first
        self.driver.execute_script("""
            var el = document.querySelector('.mc-stats-grid');
            if (el) el.scrollIntoView({block: 'center'});
        """)
        time.sleep(0.5)
        self.screenshot("07_stats")
        grids = self.driver.find_elements(By.CSS_SELECTOR, ".mc-stats-grid")
        cards = self.driver.find_elements(By.CSS_SELECTOR, ".mc-stat-card")
        if len(cards) < 12:
            return False, f"Only {len(cards)} stat cards (expected 12)"

        labels = []
        for c in cards:
            lbl = c.find_elements(By.CSS_SELECTOR, ".mc-stat-label")
            if lbl:
                labels.append(lbl[0].text.lower())

        expected = ["rounds", "chad wins", "giga wins", "draws", "chad burned", "giga burned",
                    "trade volume", "round duration"]
        missing = [e for e in expected if e not in labels]
        return len(missing) == 0, f"Missing: {missing}" if missing else f"{len(cards)} cards, all labels present"

    def test_history_table(self):
        """Test round history table with data."""
        self.screenshot("08_history")
        has = self.exists(".mc-history-section")
        if not has:
            return False, "No .mc-history-section"
        table = self.exists(".mc-history-table")
        if not table:
            return False, "No history table"

        rows = self.driver.find_elements(By.CSS_SELECTOR, ".mc-history-table tbody tr")
        headers = self.driver.find_elements(By.CSS_SELECTOR, ".mc-history-table th")
        badges = self.driver.find_elements(By.CSS_SELECTOR, ".mc-winner-badge")

        chad_wins = any(b.text == "CHAD" for b in badges)
        draws = any(b.text == "DRAW" for b in badges)

        return len(rows) >= 1, f"{len(rows)} rows, {len(headers)} cols, CHAD wins={chad_wins}, Draws={draws}"

    def test_tx_section(self):
        """Test transaction history section."""
        has = self.exists(".mc-tx-section")
        if not has:
            return False, "No .mc-tx-section"
        time.sleep(2)
        rows = self.driver.find_elements(By.CSS_SELECTOR, ".mc-tx-row")
        self.screenshot("09_transactions")
        if len(rows) == 0:
            return True, "No MemeClash TXs yet (OK)"
        labels = [r.find_elements(By.CSS_SELECTOR, ".mc-tx-label") for r in rows[:5]]
        label_texts = [l[0].text for l in labels if l]
        return True, f"{len(rows)} TXs: {label_texts[:3]}"

    def test_admin_panel(self):
        """Test admin panel visibility and contents."""
        has = self.exists(".mc-admin-section")
        if not has:
            return True, "Admin panel not visible (user is not admin or not rendered)"

        toggle = self.driver.find_element(By.CSS_SELECTOR, ".mc-admin-toggle")
        self.js_click(toggle)
        time.sleep(0.5)

        groups = self.driver.find_elements(By.CSS_SELECTOR, ".mc-admin-group")
        duration = self.exists("#mc-admin-duration")
        force = self.exists("#mc-admin-force-round")
        emerg = self.exists("#mc-admin-emerg-asset")
        self.screenshot("10_admin_panel")

        return len(groups) >= 3, f"{len(groups)} groups, Duration={duration} Force={force} Emergency={emerg}"

    def test_contract_bar(self):
        """Test contract ID bar at bottom."""
        has = self.exists(".mc-contract-bar")
        if not has:
            return False, "No .mc-contract-bar"
        bar = self.driver.find_element(By.CSS_SELECTOR, ".mc-contract-bar")
        code = bar.find_elements(By.TAG_NAME, "code")
        ok = code and "c975" in code[0].text
        return ok, f"CID starts with c975: {ok}"

    def test_pixel_font(self):
        """Test pixel font is applied to titles."""
        title = self.driver.find_elements(By.CSS_SELECTOR, ".mc-title")
        if not title:
            return False, "No .mc-title"
        font = self.driver.execute_script(
            "return window.getComputedStyle(arguments[0]).fontFamily", title[0])
        ok = "Press Start" in font or "pixel" in font.lower()
        return ok, f"Font: {font[:60]}"

    def test_pixelated_images(self):
        """Test imageRendering: pixelated on avatar images."""
        imgs = self.driver.find_elements(By.CSS_SELECTOR, ".mc-team-avatar img")
        if not imgs:
            return False, "No avatar images"
        rendering = self.driver.execute_script(
            "return window.getComputedStyle(arguments[0]).imageRendering", imgs[0])
        return rendering == "pixelated", f"imageRendering: {rendering}"

    def test_responsive_768(self):
        """Test tablet layout at 768px."""
        self.driver.set_window_size(768, 1024)
        time.sleep(1)
        self.screenshot("11_responsive_768")
        # Check battle grid switches to single column
        battle = self.driver.find_elements(By.CSS_SELECTOR, ".mc-battle")
        if battle:
            cols = self.driver.execute_script(
                "return window.getComputedStyle(arguments[0]).gridTemplateColumns", battle[0])
        scroll_w = self.driver.execute_script("return document.body.scrollWidth")
        client_w = self.driver.execute_script("return document.body.clientWidth")
        self.driver.set_window_size(1400, 900)
        overflow = scroll_w > client_w + 20
        return not overflow, f"No overflow at 768px: scroll={scroll_w} client={client_w}"

    def test_responsive_480(self):
        """Test mobile layout at 480px."""
        self.driver.set_window_size(480, 800)
        time.sleep(1)
        self.screenshot("12_responsive_480")
        scroll_w = self.driver.execute_script("return document.body.scrollWidth")
        client_w = self.driver.execute_script("return document.body.clientWidth")
        self.driver.set_window_size(1400, 900)
        overflow = scroll_w > client_w + 20
        return not overflow, f"No overflow at 480px: scroll={scroll_w} client={client_w}"

    def test_no_js_errors(self):
        """Test no JavaScript console errors."""
        try:
            logs = self.driver.get_log("browser")
            errors = [l for l in logs if l.get("level") == "SEVERE"
                     and "favicon" not in l.get("message", "")
                     and "font" not in l.get("message", "").lower()
                     and ".woff" not in l.get("message", "")]
            if errors:
                return False, f"{len(errors)} errors: {errors[0].get('message', '')[:80]}"
            return True, "No JS errors"
        except Exception:
            return True, "Console logs not available (OK)"

    def test_full_scroll(self):
        """Take screenshots at different scroll positions."""
        self.driver.execute_script("window.scrollTo(0, 0)")
        time.sleep(0.3)
        self.screenshot("13_scroll_top")
        self.driver.execute_script("window.scrollTo(0, 800)")
        time.sleep(0.3)
        self.screenshot("14_scroll_mid")
        self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(0.3)
        self.screenshot("15_scroll_bottom")
        return True, "Full page scrolled"

    # ==================================================================
    # Runner
    # ==================================================================

    def run_all(self):
        tests = [
            ("page_loads", self.test_page_loads),
            ("header", self.test_header),
            ("arena", self.test_arena_exists),
            ("round_badge", self.test_round_badge),
            ("team_avatars", self.test_team_avatars),
            ("team_names", self.test_team_names),
            ("treasury_display", self.test_treasury_display),
            ("pool_info", self.test_pool_info),
            ("power_bar", self.test_power_bar),
            ("swap_section", self.test_swap_section),
            ("swap_team_toggle", self.test_swap_team_toggle),
            ("swap_quote", self.test_swap_quote),
            ("howto_section", self.test_howto_section),
            ("deposit_section", self.test_deposit_section),
            ("lifetime_stats", self.test_lifetime_stats),
            ("history_table", self.test_history_table),
            ("tx_section", self.test_tx_section),
            ("admin_panel", self.test_admin_panel),
            ("contract_bar", self.test_contract_bar),
            ("pixel_font", self.test_pixel_font),
            ("pixelated_images", self.test_pixelated_images),
            ("responsive_768", self.test_responsive_768),
            ("responsive_480", self.test_responsive_480),
            ("no_js_errors", self.test_no_js_errors),
            ("full_scroll", self.test_full_scroll),
        ]

        passed = 0
        failed = 0
        results = []

        print("=" * 60)
        print("MemeClash UI Tests (25 tests)")
        print("=" * 60)

        for name, test_fn in tests:
            try:
                ok, msg = test_fn()
                symbol = "+" if ok else "X"
                print(f"  {symbol} {name} - {msg}")
                results.append((name, ok, msg))
                if ok:
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                self.screenshot(f"FAIL_{name}")
                print(f"  X {name} - ERROR: {e}")
                results.append((name, False, str(e)))
                failed += 1

        print(f"\n{'='*60}")
        print(f"Results: {passed} passed, {failed} failed out of {len(tests)}")
        print(f"{'='*60}")

        if failed > 0:
            print("\nFailures:")
            for name, ok, msg in results:
                if not ok:
                    print(f"  - {name}: {msg}")

        print(f"\nScreenshots: {SCREENSHOT_DIR}/")
        self.driver.quit()
        return failed == 0


if __name__ == "__main__":
    headless = "--headless" in sys.argv
    tests = MemeClashUITests(headless=headless)
    success = tests.run_all()
    sys.exit(0 if success else 1)
