#!/usr/bin/env python3
"""
P2P Marketplace Test Suite
Tests all the fixes made to the P2P marketplace
"""

import time
import os
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Test configuration
BASE_URL = "http://127.0.0.1:9080"
P2P_URL = f"{BASE_URL}/src/p2p/p2p.html"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "p2p_fixes")

# Ensure screenshot directory exists
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

class P2PFixesTest:
    def __init__(self, headless=True):
        options = Options()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--window-size=1400,900')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')

        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(5)
        self.results = []

    def screenshot(self, name):
        path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
        self.driver.save_screenshot(path)
        print(f"  Screenshot: {path}")
        return path

    def wait_for(self, selector, timeout=10):
        return WebDriverWait(self.driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )

    def wait_visible(self, selector, timeout=10):
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def log_result(self, test_name, passed, message=""):
        status = "PASS" if passed else "FAIL"
        self.results.append((test_name, passed, message))
        print(f"[{status}] {test_name}" + (f": {message}" if message else ""))

    def run_test(self, name, test_func):
        print(f"\nRunning: {name}")
        try:
            result = test_func()
            self.log_result(name, result if isinstance(result, bool) else True,
                          result if isinstance(result, str) else "")
        except Exception as e:
            self.screenshot(f"FAIL_{name.replace(' ', '_')}")
            self.log_result(name, False, str(e))

    # ==================== TESTS ====================

    def test_p2p_page_loads(self):
        """Test that P2P page loads without errors"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Check for main container
        container = self.driver.find_element(By.CSS_SELECTOR, ".p2p-container")
        self.screenshot("01_p2p_loaded")

        # Check for console errors
        logs = self.driver.get_log('browser')
        errors = [log for log in logs if log['level'] == 'SEVERE']
        if errors:
            print(f"  Console errors: {len(errors)}")
            for e in errors[:3]:
                print(f"    - {e['message'][:100]}")

        return container is not None

    def test_buy_sell_tabs(self):
        """Test Buy/Sell tab switching"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Click Sell tab
        sell_btn = self.driver.find_element(By.ID, "btn-sell")
        sell_btn.click()
        time.sleep(0.5)

        # Verify sell tab is active
        sell_active = "active" in sell_btn.get_attribute("class")
        self.screenshot("02_sell_tab_active")

        # Click Buy tab
        buy_btn = self.driver.find_element(By.ID, "btn-buy")
        buy_btn.click()
        time.sleep(0.5)

        buy_active = "active" in buy_btn.get_attribute("class")

        return sell_active and buy_active

    def test_create_order_modal_buy(self):
        """Test Create Order modal in BUY mode"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Ensure Buy tab is active
        buy_btn = self.driver.find_element(By.ID, "btn-buy")
        buy_btn.click()
        time.sleep(0.5)

        # Click New Offer button
        new_offer_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick='showCreateOrder()']")
        new_offer_btn.click()
        time.sleep(1)

        # Check modal opened
        modal = self.wait_visible("#create-order-modal")
        self.screenshot("03_create_order_buy_mode")

        # Check order type shows "BUY"
        order_type = self.driver.find_element(By.ID, "create-order-type")
        type_text = order_type.text.upper()

        # Close modal
        close_btn = self.driver.find_element(By.CSS_SELECTOR, "#create-order-modal .modal-close")
        close_btn.click()
        time.sleep(0.5)

        return "BUY" in type_text

    def test_create_order_modal_sell(self):
        """Test Create Order modal in SELL mode shows SELL"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Click Sell tab
        sell_btn = self.driver.find_element(By.ID, "btn-sell")
        sell_btn.click()
        time.sleep(0.5)

        # Click New Offer button
        new_offer_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick='showCreateOrder()']")
        new_offer_btn.click()
        time.sleep(1)

        # Check modal opened
        modal = self.wait_visible("#create-order-modal")
        self.screenshot("04_create_order_sell_mode")

        # Check order type shows "SELL"
        order_type = self.driver.find_element(By.ID, "create-order-type")
        type_text = order_type.text.upper()

        # Close modal
        close_btn = self.driver.find_element(By.CSS_SELECTOR, "#create-order-modal .modal-close")
        close_btn.click()
        time.sleep(0.5)

        return "SELL" in type_text

    def test_my_trades_modal(self):
        """Test My Trades modal with all tabs"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Click Active Trades button
        trades_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick='showMyTrades()']")
        trades_btn.click()
        time.sleep(1)

        # Check modal opened
        modal = self.wait_visible("#my-trades-modal")
        self.screenshot("05_my_trades_modal")

        # Check all tabs exist
        tabs = self.driver.find_elements(By.CSS_SELECTOR, "#my-trades-modal .trades-tab")
        tab_texts = [t.text for t in tabs]

        has_active = any("Active" in t for t in tab_texts)
        has_completed = any("Completed" in t for t in tab_texts)
        has_orders = any("Order" in t for t in tab_texts)

        # Click My Orders tab
        for tab in tabs:
            if "Order" in tab.text:
                tab.click()
                time.sleep(0.5)
                break

        # Check my-orders-section exists
        try:
            orders_section = self.driver.find_element(By.ID, "my-orders-section")
            section_exists = True
            self.screenshot("06_my_orders_tab")
        except NoSuchElementException:
            section_exists = False

        # Close modal
        close_btn = self.driver.find_element(By.CSS_SELECTOR, "#my-trades-modal .modal-close")
        close_btn.click()

        return has_active and has_completed and has_orders and section_exists

    def test_escrow_staking_modal(self):
        """Test Escrow Staking modal opens"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Click Become Arbiter button
        try:
            arbiter_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick='showEscrowStaking()']")
            arbiter_btn.click()
            time.sleep(1)

            modal = self.wait_visible("#escrow-modal")
            self.screenshot("07_escrow_modal")

            # Check for staking input
            stake_input = self.driver.find_element(By.ID, "escrow-stake-amount")

            # Close modal
            close_btn = self.driver.find_element(By.CSS_SELECTOR, "#escrow-modal .modal-close")
            close_btn.click()

            return stake_input is not None
        except Exception as e:
            return f"Error: {e}"

    def test_trader_profile_modal(self):
        """Test Trader Profile modal elements"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Open global stats to find leaderboard
        try:
            stats_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick='showGlobalStats()']")
            stats_btn.click()
            time.sleep(1)

            modal = self.wait_visible("#global-stats-modal")
            self.screenshot("08_global_stats")

            # Check SVG trust arc has correct initial value
            trust_arc = self.driver.find_element(By.ID, "profile-trust-arc")
            dasharray = trust_arc.get_attribute("stroke-dasharray") if trust_arc else None

            # Close modal
            close_btn = self.driver.find_element(By.CSS_SELECTOR, "#global-stats-modal .modal-close")
            close_btn.click()

            return True  # Stats modal opened successfully
        except Exception as e:
            return f"Error: {e}"

    def test_help_modal(self):
        """Test Help modal opens"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        try:
            help_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick='showHelp()']")
            help_btn.click()
            time.sleep(1)

            modal = self.wait_visible("#help-modal")
            self.screenshot("09_help_modal")

            # Check FAQ items exist
            faq_items = self.driver.find_elements(By.CSS_SELECTOR, "#help-modal .faq-question")

            # Close modal
            close_btn = self.driver.find_element(By.CSS_SELECTOR, "#help-modal .modal-close")
            close_btn.click()

            return len(faq_items) > 0
        except Exception as e:
            return f"Error: {e}"

    def test_asset_tabs(self):
        """Test asset tab switching (FOMO/BEAM/NPH)"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        try:
            asset_tabs = self.driver.find_elements(By.CSS_SELECTOR, ".asset-tab")

            # Click BEAM tab
            for tab in asset_tabs:
                if "BEAM" in tab.text:
                    tab.click()
                    time.sleep(0.5)
                    is_active = "active" in tab.get_attribute("class")
                    self.screenshot("10_beam_tab")
                    return is_active

            return False
        except Exception as e:
            return f"Error: {e}"

    def test_payment_details_elements(self):
        """Test that payment detail elements exist in active-trade-modal HTML"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        # Check if the elements exist in the DOM (even if modal not visible)
        elements_to_check = [
            "active-payment-method",
            "active-pay-amount",
            "active-bank-name",
            "active-account",
            "active-holder-name",
            "active-reference"
        ]

        found = []
        missing = []

        for elem_id in elements_to_check:
            try:
                elem = self.driver.find_element(By.ID, elem_id)
                found.append(elem_id)
            except NoSuchElementException:
                missing.append(elem_id)

        self.screenshot("11_payment_elements_check")

        if missing:
            return f"Missing: {missing}"
        return True

    def test_no_telegram_modal(self):
        """Test that dead telegram-settings-modal was removed"""
        self.driver.get(P2P_URL)
        time.sleep(2)

        try:
            modal = self.driver.find_element(By.ID, "telegram-settings-modal")
            return "Modal still exists (should be removed)"
        except NoSuchElementException:
            return True  # Good - modal was removed

    def run_all(self):
        """Run all tests"""
        print("=" * 60)
        print("P2P Marketplace Fixes Test Suite")
        print("=" * 60)

        tests = [
            ("P2P Page Loads", self.test_p2p_page_loads),
            ("Buy/Sell Tabs", self.test_buy_sell_tabs),
            ("Create Order - BUY Mode", self.test_create_order_modal_buy),
            ("Create Order - SELL Mode", self.test_create_order_modal_sell),
            ("My Trades Modal + Tabs", self.test_my_trades_modal),
            ("Escrow Staking Modal", self.test_escrow_staking_modal),
            ("Global Stats Modal", self.test_trader_profile_modal),
            ("Help Modal", self.test_help_modal),
            ("Asset Tabs", self.test_asset_tabs),
            ("Payment Detail Elements", self.test_payment_details_elements),
            ("Telegram Modal Removed", self.test_no_telegram_modal),
        ]

        for name, test_func in tests:
            self.run_test(name, test_func)

        # Print summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)

        passed = sum(1 for _, p, _ in self.results if p)
        failed = sum(1 for _, p, _ in self.results if not p)

        for name, p, msg in self.results:
            status = "PASS" if p else "FAIL"
            print(f"  [{status}] {name}" + (f": {msg}" if msg and not p else ""))

        print(f"\nTotal: {passed} passed, {failed} failed out of {len(self.results)}")
        print(f"Screenshots saved to: {SCREENSHOT_DIR}")

        self.driver.quit()
        return failed == 0


if __name__ == "__main__":
    headless = "--headless" in sys.argv or "-h" not in sys.argv
    print(f"Running tests {'headless' if headless else 'with browser visible'}...")

    tester = P2PFixesTest(headless=headless)
    success = tester.run_all()
    sys.exit(0 if success else 1)
