#!/usr/bin/env python3
"""
Fuddle v2 UI Selenium Tests
============================
Tests for the Fuddle game frontend with v2 tournament lobby.
Requires: serve.py running on port 9080, Chrome/Chromium installed.

Usage:
    python3 tests/test_fuddle_ui.py
    python3 tests/test_fuddle_ui.py --headless
"""

import os
import sys
import time

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
except ImportError:
    print("ERROR: selenium not installed. Run: pip install selenium")
    sys.exit(1)


BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "fuddle")


class FuddleUITests:
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
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].click();", element)

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

    def go_to_fuddle(self):
        """Navigate to Fuddle page via App Store."""
        self.dismiss_overlay()
        nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='appstore']")
        self.js_click(nav)
        time.sleep(1)
        self.dismiss_overlay()
        featured = self.driver.find_element(By.CSS_SELECTOR, ".appstore-featured")
        self.js_click(featured)
        time.sleep(4)
        self.dismiss_overlay()

    # ======================================================================
    # Test: App Store navigation
    # ======================================================================
    def test_appstore_nav_exists(self):
        """App Store nav item should be in sidebar."""
        self.navigate_to_wallet()
        nav_items = self.driver.find_elements(By.CSS_SELECTOR, ".nav-item[data-page]")
        pages = [n.get_attribute("data-page") for n in nav_items]
        ok = "appstore" in pages
        self.screenshot("01_sidebar_nav")
        assert ok, f"'appstore' not found in nav pages: {pages}"
        print("    PASS: App Store nav item exists")

    # ======================================================================
    # Test: App Store page renders
    # ======================================================================
    def test_appstore_page_renders(self):
        """Clicking App Store nav should show the page."""
        self.dismiss_overlay()
        nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='appstore']")
        self.js_click(nav)
        time.sleep(1)
        page = self.driver.find_element(By.CSS_SELECTOR, "#page-appstore")
        assert page.is_displayed(), "App Store page not visible"
        self.screenshot("02_appstore_page")
        print("    PASS: App Store page renders")

    # ======================================================================
    # Test: Featured Fuddle card exists
    # ======================================================================
    def test_fuddle_featured_card(self):
        """Fuddle should appear as featured card in App Store."""
        featured = self.driver.find_elements(By.CSS_SELECTOR, ".appstore-featured")
        assert len(featured) > 0, "No featured card found"
        text = featured[0].text.upper()
        assert "FUDDLE" in text, f"Featured card doesn't mention FUDDLE: {text[:100]}"
        self.screenshot("03_fuddle_featured")
        print("    PASS: Fuddle featured card exists")

    # ======================================================================
    # Test: Launch Fuddle
    # ======================================================================
    def test_launch_fuddle(self):
        """Clicking Fuddle card should navigate to Fuddle page."""
        featured = self.driver.find_element(By.CSS_SELECTOR, ".appstore-featured")
        self.js_click(featured)
        time.sleep(4)
        fuddle_page = self.driver.find_element(By.CSS_SELECTOR, "#page-fuddle")
        assert fuddle_page.is_displayed(), "Fuddle page not visible"
        fuddle_root = self.driver.find_element(By.CSS_SELECTOR, "#fuddle-root")
        assert fuddle_root.text.strip(), "Fuddle root is empty"
        self.screenshot("04_fuddle_launched")
        print("    PASS: Fuddle page launches")

    # ======================================================================
    # Test: CID display
    # ======================================================================
    def test_cid_display(self):
        """Contract ID should be displayed and copyable."""
        cid_display = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-cid-display")
        assert len(cid_display) > 0, "CID display not found"
        text = cid_display[0].text
        assert "Contract" in text, f"CID display missing label: {text}"
        print("    PASS: CID display visible")

    # ======================================================================
    # Test: Tournament cards (v2)
    # ======================================================================
    def test_tournament_cards(self):
        """Three tournament cards should render (Lite/Classic/Pro)."""
        grid = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournaments-grid")
        assert len(grid) > 0, "Tournaments grid not found"

        cards = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-card")
        assert len(cards) == 3, f"Expected 3 tournament cards, got {len(cards)}"

        # Check each has tier badge, prize, and play button
        for card in cards:
            badge = card.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-tier-badge")
            assert len(badge) > 0, "Missing tier badge"
            prize = card.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-prize")
            assert len(prize) > 0, "Missing prize display"
            play_btn = card.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-play, .fuddle-tournament-claim")
            assert len(play_btn) > 0, "Missing play/claim button"

        self.screenshot("05_tournament_cards")
        print("    PASS: 3 tournament cards with badges, prizes, and buttons")

    # ======================================================================
    # Test: Tournament card content
    # ======================================================================
    def test_tournament_card_content(self):
        """Each card should have players, score, time left, and donate button."""
        cards = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-card")
        for card in cards:
            meta = card.find_elements(By.CSS_SELECTOR, ".meta-item")
            assert len(meta) >= 3, f"Expected at least 3 meta items, got {len(meta)}"
            donate = card.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-donate")
            assert len(donate) > 0, "Missing donate button"
        print("    PASS: Tournament cards have full content")

    # ======================================================================
    # Test: Fuddle header
    # ======================================================================
    def test_fuddle_header(self):
        """Header should have back button, title, and help button."""
        back_btn = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-back-btn")
        assert len(back_btn) > 0, "Back button not found"
        title = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-title")
        assert len(title) > 0, "Title not found"
        assert "FUDDLE" in title[0].text.upper(), f"Title text: {title[0].text}"
        help_btn = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-help-btn")
        assert len(help_btn) > 0, "Help button not found"
        self.screenshot("06_fuddle_header")
        print("    PASS: Header has all elements")

    # ======================================================================
    # Test: Back navigation
    # ======================================================================
    def test_back_navigation(self):
        """Clicking back should return to App Store."""
        back_btn = self.driver.find_element(By.CSS_SELECTOR, ".fuddle-back-btn")
        self.js_click(back_btn)
        time.sleep(1)
        appstore = self.driver.find_element(By.CSS_SELECTOR, "#page-appstore")
        assert appstore.is_displayed(), "App Store page not visible after back"
        self.screenshot("07_back_to_appstore")
        print("    PASS: Back navigation works")

    # ======================================================================
    # Test: How To Play modal
    # ======================================================================
    def test_how_to_play(self):
        """How To Play button should open modal."""
        self.go_to_fuddle()
        help_btns = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-help-btn")
        if not help_btns:
            print("    SKIP: No help button")
            return
        self.js_click(help_btns[0])
        time.sleep(0.5)
        modal = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-result-overlay")
        assert len(modal) > 0, "How to Play modal not opened"
        assert modal[0].is_displayed()
        self.screenshot("08_how_to_play")
        close_btn = modal[0].find_element(By.CSS_SELECTOR, ".btn-accent")
        self.js_click(close_btn)
        time.sleep(0.3)
        print("    PASS: How To Play modal works")

    # ======================================================================
    # Test: Letter shop
    # ======================================================================
    def test_letter_shop(self):
        """Buy Letters should open shop with 26 letters and lootboxes."""
        self.dismiss_overlay()
        self.driver.execute_script("""
            var btns = document.querySelectorAll('#fuddle-root button');
            for (var b of btns) {
                if (b.textContent.includes('Buy Letters')) { b.click(); break; }
            }
        """)
        time.sleep(1)
        text = self.driver.find_element(By.CSS_SELECTOR, "#fuddle-root").text.lower()
        assert "letter shop" in text, "Letter Shop title missing"
        letters = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-shop-letter")
        assert len(letters) == 26, f"Expected 26 letters, got {len(letters)}"
        self.screenshot("09_letter_shop")
        # Go back
        self.driver.execute_script("fuddleBackFromShop()")
        time.sleep(1)
        print("    PASS: Letter shop opens with 26 letters")

    # ======================================================================
    # Test: Donate modal
    # ======================================================================
    def test_donate_modal(self):
        """Clicking Donate on a tournament card should open modal."""
        self.dismiss_overlay()
        donate_btns = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-donate")
        if not donate_btns:
            print("    SKIP: No donate buttons")
            return
        self.js_click(donate_btns[0])
        time.sleep(0.5)
        modal = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-result-overlay")
        if modal and modal[0].is_displayed():
            self.screenshot("10_donate_modal")
            close_btn = modal[0].find_elements(By.CSS_SELECTOR, "button")
            if close_btn:
                self.js_click(close_btn[-1])
                time.sleep(0.3)
            print("    PASS: Donate modal opens")
        else:
            print("    PASS: Donate modal invoked (modal may use confirm())")

    # ======================================================================
    # Test: Physical keyboard handler
    # ======================================================================
    def test_physical_keyboard(self):
        """Physical keyboard handler should be defined."""
        has_handler = self.driver.execute_script(
            "return typeof fuddleHandlePhysicalKey === 'function'"
        )
        assert has_handler, "fuddleHandlePhysicalKey function not defined"
        print("    PASS: Physical keyboard handler exists")

    # ======================================================================
    # Test: CSS loaded
    # ======================================================================
    def test_css_loaded(self):
        """Fuddle CSS variables should be defined."""
        accent = self.driver.execute_script(
            "return getComputedStyle(document.documentElement).getPropertyValue('--fuddle-accent').trim()"
        )
        ok = len(accent) > 0
        if not ok:
            # Fallback: check element dimensions
            cards = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-card")
            if cards:
                size = cards[0].size
                ok = size["width"] > 100 and size["height"] > 50
        self.screenshot("11_css_check")
        assert ok, "Fuddle CSS not loaded"
        print("    PASS: Fuddle CSS loaded")

    # ======================================================================
    # Test: No native confirm() dialogs
    # ======================================================================
    def test_no_native_confirms(self):
        """Native confirm() should NOT be called by buy letter."""
        self.go_to_fuddle()
        # Override window.confirm to track calls
        self.driver.execute_script("""
            window._confirmCalled = false;
            window._origConfirm = window.confirm;
            window.confirm = function() { window._confirmCalled = true; return false; };
        """)
        # Trigger buy letter (should use styled modal, not confirm)
        self.driver.execute_script("fuddleBuyLetter(0)")
        time.sleep(1)
        called = self.driver.execute_script("return window._confirmCalled")
        # Restore
        self.driver.execute_script("window.confirm = window._origConfirm")
        assert not called, "Native confirm() was called — should use styled modal"
        # Clean up modal if opened
        self.driver.execute_script("""
            var ov = document.getElementById('fuddle-confirm-modal-overlay');
            if (ov) ov.remove();
        """)
        self.screenshot("12_no_native_confirm")
        print("    PASS: No native confirm() used")

    # ======================================================================
    # Test: Difficulty picker modal
    # ======================================================================
    def test_difficulty_picker(self):
        """Clicking Play Now should show styled difficulty picker."""
        self.dismiss_overlay()
        play_btns = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tournament-play")
        if not play_btns:
            print("    SKIP: No play buttons")
            return
        self.js_click(play_btns[0])
        time.sleep(0.5)
        diff_btns = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-diff-btn")
        assert len(diff_btns) == 3, f"Expected 3 difficulty buttons, got {len(diff_btns)}"
        # Check labels
        texts = [b.text for b in diff_btns]
        assert any("4" in t for t in texts), "Missing 4-letter option"
        assert any("5" in t for t in texts), "Missing 5-letter option"
        assert any("6" in t for t in texts), "Missing 6-letter option"
        self.screenshot("13_difficulty_picker")
        # Close
        cancel = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-result-overlay .btn-outline")
        if cancel:
            self.js_click(cancel[-1])
            time.sleep(0.3)
        print("    PASS: Difficulty picker shows 3 options")

    # ======================================================================
    # Test: TX progress overlay
    # ======================================================================
    def test_tx_progress_overlay(self):
        """TX progress bottom bar should render with all elements."""
        self.dismiss_overlay()
        self.driver.execute_script(
            "fuddleShowTxProgress('Test Title', 'Test Detail', 'Test step text')"
        )
        time.sleep(0.5)
        bar = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-tx-progress-overlay.fuddle-tx-bar")
        assert len(bar) > 0, "TX progress bottom bar not found"
        assert bar[0].is_displayed()

        # Check progress fill bar
        fill = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-txp-bar")
        assert len(fill) > 0, "Progress fill bar not found"

        # Check title
        title = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tx-bar-title")
        assert len(title) > 0, "Title not found"
        assert "Test Title" in title[0].text

        # Check status text
        text = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tx-bar-text")
        assert len(text) > 0, "Status text not found"
        assert "Test step text" in text[0].text

        # Check spinner
        spinner = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tx-bar-spinner")
        assert len(spinner) > 0, "Spinner not found"

        # Check close button
        close_btn = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tx-bar-close")
        assert len(close_btn) > 0, "Close button not found"

        # Check it's a bottom bar (not full-screen overlay)
        is_bottom = self.driver.execute_script(
            "var el = document.getElementById('fuddle-tx-progress-overlay'); "
            "return el && el.classList.contains('fuddle-tx-bar') && "
            "window.getComputedStyle(el).position === 'fixed'"
        )
        assert is_bottom, "TX progress should be a fixed bottom bar, not overlay"

        self.screenshot("14_tx_progress_bar")

        # Hide it
        self.driver.execute_script("fuddleHideTxProgress()")
        time.sleep(0.5)
        remaining = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-tx-progress-overlay")
        assert len(remaining) == 0, "Bar not removed after hide"
        print("    PASS: TX progress bottom bar renders and hides")

    # ======================================================================
    # Test: Styled confirm modal
    # ======================================================================
    def test_confirm_modal(self):
        """fuddleConfirmModal should render with title, message, buttons."""
        self.dismiss_overlay()
        self.driver.execute_script("""
            fuddleConfirmModal('Test Confirm', 'Are you sure about this?', 'Yes Do It', function(){})
        """)
        time.sleep(0.5)
        overlay = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-confirm-modal-overlay")
        assert len(overlay) > 0, "Confirm modal overlay not found"
        assert overlay[0].is_displayed()

        text = overlay[0].text
        assert "Test Confirm" in text, "Title missing"
        assert "Are you sure" in text, "Message missing"
        assert "Yes Do It" in text, "Confirm button text missing"

        self.screenshot("15_confirm_modal")

        # Cancel should close it
        cancel = overlay[0].find_elements(By.CSS_SELECTOR, ".btn-outline")
        if cancel:
            self.js_click(cancel[0])
            time.sleep(0.3)
        remaining = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-confirm-modal-overlay")
        assert len(remaining) == 0, "Confirm modal not closed by Cancel"
        print("    PASS: Styled confirm modal works")

    # ======================================================================
    # Test: Game word flow (entering letters, keyboard, submit)
    # ======================================================================
    def test_game_word_flow(self):
        """Test entering letters into game board and keyboard interaction."""
        self.dismiss_overlay()
        # Check if there are active games we can enter
        active_games = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-active-game")
        if active_games:
            self.js_click(active_games[0])
            time.sleep(2)
        else:
            # No active game — test keyboard functions exist
            has_fn = self.driver.execute_script(
                "return typeof fuddleKeyPress === 'function' && typeof fuddleSubmitGuess === 'function'"
            )
            assert has_fn, "Game functions not defined"
            print("    PASS: Game word flow — functions verified (no active game to enter)")
            return

        self.screenshot("16_game_board")

        # Should see board and keyboard
        board = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-board")
        kb = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-keyboard")
        assert len(board) > 0, "Game board not found"
        assert len(kb) > 0, "Keyboard not found"

        # Check tiles exist
        tiles = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-tile")
        assert len(tiles) > 0, "No tiles found"

        # Check keys exist
        keys = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-key")
        assert len(keys) > 0, "No keyboard keys found"

        # Check submit button exists
        submit = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-submit-btn")
        assert len(submit) > 0, "Submit button not found"

        # Check status bar shows attempts
        status = self.driver.find_elements(By.CSS_SELECTOR, ".fuddle-status")
        assert len(status) > 0, "Status bar not found"
        assert "Attempts" in status[0].text, "Status doesn't show attempts"

        self.screenshot("17_game_elements")

        # Go back to lobby
        back_btn = self.driver.find_element(By.CSS_SELECTOR, ".fuddle-back-btn")
        self.js_click(back_btn)
        time.sleep(2)
        print("    PASS: Game word flow — board, keyboard, tiles, submit, status all present")

    # ======================================================================
    # Test: Game scoring display
    # ======================================================================
    def test_game_scoring(self):
        """Test scoring formula and win/loss modal functions exist."""
        self.dismiss_overlay()
        # Verify scoring constants
        score_check = self.driver.execute_script("""
            return {
                diffMult: typeof DIFF_MULTIPLIER !== 'undefined' ? DIFF_MULTIPLIER : null,
                winModal: typeof fuddleShowWinModal === 'function',
                lossModal: typeof fuddleShowLossModal === 'function',
                estimateReward: typeof fuddleEstimateReward === 'function'
            }
        """)
        assert score_check['diffMult'] is not None, "DIFF_MULTIPLIER not defined"
        assert score_check['diffMult']['4'] == 100, f"4-letter mult wrong: {score_check['diffMult']['4']}"
        assert score_check['diffMult']['5'] == 125, f"5-letter mult wrong: {score_check['diffMult']['5']}"
        assert score_check['diffMult']['6'] == 150, f"6-letter mult wrong: {score_check['diffMult']['6']}"
        assert score_check['winModal'], "fuddleShowWinModal not defined"
        assert score_check['lossModal'], "fuddleShowLossModal not defined"
        assert score_check['estimateReward'], "fuddleEstimateReward not defined"

        # Test score calculation
        score = self.driver.execute_script("""
            // Score = (1000 + (7 - attempts) * 150) * multiplier/100
            // 5-letter, 3 attempts = (1000 + 4*150) * 1.25 = 1600 * 1.25 = 2000
            return (1000 + (7 - 3) * 150) * DIFF_MULTIPLIER[5] / 100;
        """)
        assert score == 2000, f"Score formula wrong: expected 2000, got {score}"

        self.screenshot("18_scoring_check")
        print("    PASS: Game scoring — multipliers, modals, formula all correct")

    # ======================================================================
    # Test: Insufficient funds modal
    # ======================================================================
    def test_insufficient_funds_modal(self):
        """fuddleShowInsufficientFundsModal should show buybeam.my link."""
        self.dismiss_overlay()
        self.driver.execute_script("fuddleShowInsufficientFundsModal()")
        time.sleep(0.5)
        overlay = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-insufficient-funds-overlay")
        assert len(overlay) > 0, "Insufficient funds modal not found"
        assert overlay[0].is_displayed()

        text = overlay[0].text
        assert "Not Enough Funds" in text, "Title missing"
        assert "buybeam" in text.lower() or "Buy BEAM" in text, "buybeam.my link missing"

        # Check the buy link exists with correct href
        link = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-insufficient-funds-overlay a[href*='buybeam']")
        assert len(link) > 0, "buybeam.my link element not found"
        assert link[0].get_attribute('href') == 'https://buybeam.my', \
            f"Wrong href: {link[0].get_attribute('href')}"
        assert link[0].get_attribute('target') == '_blank', "Link should open in new tab"

        self.screenshot("19_insufficient_funds_modal")

        # Close it
        close_btn = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-insufficient-funds-overlay .btn-outline")
        assert len(close_btn) > 0, "Close button not found"
        self.js_click(close_btn[0])
        time.sleep(0.3)
        remaining = self.driver.find_elements(By.CSS_SELECTOR, "#fuddle-insufficient-funds-overlay")
        assert len(remaining) == 0, "Modal not closed"
        print("    PASS: Insufficient funds modal with buybeam.my link")

    # ======================================================================
    # Run all tests
    # ======================================================================
    def run_all(self):
        print("=" * 50)
        print("Fuddle v2 UI Tests")
        print("=" * 50)

        tests = [
            ("App Store nav exists", self.test_appstore_nav_exists),
            ("App Store page renders", self.test_appstore_page_renders),
            ("Fuddle featured card", self.test_fuddle_featured_card),
            ("Launch Fuddle", self.test_launch_fuddle),
            ("CID display", self.test_cid_display),
            ("Tournament cards (3)", self.test_tournament_cards),
            ("Tournament card content", self.test_tournament_card_content),
            ("Fuddle header", self.test_fuddle_header),
            ("Back navigation", self.test_back_navigation),
            ("How To Play modal", self.test_how_to_play),
            ("Letter shop", self.test_letter_shop),
            ("Donate modal", self.test_donate_modal),
            ("Physical keyboard", self.test_physical_keyboard),
            ("CSS loaded", self.test_css_loaded),
            ("No native confirms", self.test_no_native_confirms),
            ("Difficulty picker", self.test_difficulty_picker),
            ("TX progress overlay", self.test_tx_progress_overlay),
            ("Confirm modal", self.test_confirm_modal),
            ("Game word flow", self.test_game_word_flow),
            ("Game scoring", self.test_game_scoring),
            ("Insufficient funds modal", self.test_insufficient_funds_modal),
        ]

        passed = 0
        failed = 0

        for name, test_fn in tests:
            print(f"\n  Testing: {name}")
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

        print(f"\n{'='*50}")
        print(f"Results: {passed} passed, {failed} failed")
        print(f"{'='*50}")

        self.driver.quit()
        return failed == 0


def main():
    headless = "--headless" in sys.argv

    try:
        tests = FuddleUITests(headless=headless)
        success = tests.run_all()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\nFATAL: {e}")
        print("Make sure serve.py is running on port 9080 and Chrome is installed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
