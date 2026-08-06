#!/usr/bin/env python3
"""
P2P Exchange Screenshot Test Script
Takes screenshots of all major views and modals in the BEAM P2P Exchange.

Usage:
    python3 test_p2p_screenshots.py [--headless]
"""

import os
import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, WebDriverException

# Derived, not hardcoded: an absolute path embedded a real name in a public repo.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

# Configuration
P2P_URL = "http://127.0.0.1:9080/src/p2p/p2p.html"
SCREENSHOT_DIR = _os.path.join(REPO_ROOT, "tests", "screenshots")
DEBUG_PORT = 9222

class P2PScreenshotTest:
    def __init__(self, headless=False):
        self.headless = headless
        self.driver = None
        self.results = []
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def setup_driver(self):
        """Setup Chrome WebDriver, trying debug port first, then headless."""
        options = Options()

        # First try connecting to existing Chrome with debug port
        if not self.headless:
            try:
                print(f"Attempting to connect to Chrome debug port {DEBUG_PORT}...")
                options.add_experimental_option("debuggerAddress", f"127.0.0.1:{DEBUG_PORT}")
                self.driver = webdriver.Chrome(options=options)
                print("Connected to existing Chrome instance")
                return True
            except WebDriverException as e:
                print(f"Could not connect to debug port: {e}")
                print("Falling back to headless Chrome...")

        # Fallback to headless Chrome
        options = Options()
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--window-size=1400,900')
        options.add_argument('--disable-gpu')

        try:
            self.driver = webdriver.Chrome(options=options)
            print("Started headless Chrome")
            return True
        except WebDriverException as e:
            print(f"Failed to start Chrome: {e}")
            return False

    def screenshot(self, name, description=""):
        """Take a screenshot and save it."""
        filepath = os.path.join(SCREENSHOT_DIR, f"{name}.png")
        try:
            self.driver.save_screenshot(filepath)
            self.results.append((name, "SUCCESS", description))
            print(f"  [OK] {name}.png - {description}")
            return True
        except Exception as e:
            self.results.append((name, "FAILED", str(e)))
            print(f"  [FAIL] {name}.png - {e}")
            return False

    def wait_for_element(self, selector, timeout=5):
        """Wait for element to be visible."""
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
            )
        except TimeoutException:
            return None

    def execute_js(self, script, *args):
        """Execute JavaScript and return result."""
        try:
            return self.driver.execute_script(script, *args)
        except Exception as e:
            print(f"  JS error: {e}")
            return None

    def close_modal(self, modal_id):
        """Close a modal by ID."""
        self.execute_js(f"closeModal('{modal_id}')")
        time.sleep(0.3)

    def open_modal_and_screenshot(self, js_func, modal_id, screenshot_name, description):
        """Open a modal, take screenshot, close it."""
        self.execute_js(js_func)
        time.sleep(0.5)  # Wait for modal animation
        self.screenshot(screenshot_name, description)
        self.close_modal(modal_id)
        time.sleep(0.3)

    def run_tests(self):
        """Run all screenshot tests."""
        print("\n" + "="*60)
        print("P2P Exchange Screenshot Tests")
        print("="*60)

        if not self.setup_driver():
            print("FATAL: Could not start WebDriver")
            return False

        try:
            # Navigate to P2P page
            print(f"\nNavigating to {P2P_URL}")
            self.driver.get(P2P_URL)
            time.sleep(2)  # Wait for page load

            # === MAIN VIEWS ===
            print("\n--- Main Views ---")

            # 1. Main Buy View (default)
            self.screenshot("p2p_01_main_buy_view", "Main page with Buy tab selected")

            # 2. Main Sell View
            self.execute_js("setSide('sell')")
            time.sleep(0.3)
            self.screenshot("p2p_02_main_sell_view", "Main page with Sell tab selected")

            # Reset to buy
            self.execute_js("setSide('buy')")
            time.sleep(0.3)

            # 3-5. Asset tabs
            self.execute_js("setAsset(174)")
            time.sleep(0.3)
            self.screenshot("p2p_03_fomo_asset", "FOMO asset tab selected")

            self.execute_js("setAsset(0)")
            time.sleep(0.3)
            self.screenshot("p2p_04_beam_asset", "BEAM asset tab selected")

            self.execute_js("setAsset(47)")
            time.sleep(0.3)
            self.screenshot("p2p_05_nph_asset", "NPH asset tab selected")

            # Reset to FOMO
            self.execute_js("setAsset(174)")

            # === DROPDOWNS ===
            print("\n--- Dropdowns ---")

            # 6. Currency dropdown
            currency_select = self.driver.find_element(By.ID, "currency-select")
            self.execute_js("arguments[0].focus(); arguments[0].click();", currency_select)
            time.sleep(0.3)
            self.screenshot("p2p_06_currency_dropdown", "Currency selector expanded")
            self.execute_js("arguments[0].blur();", currency_select)

            # 7. Payment methods dropdown
            self.execute_js("togglePaymentDropdown()")
            time.sleep(0.3)
            self.screenshot("p2p_07_payment_dropdown", "Payment methods dropdown expanded")
            self.execute_js("togglePaymentDropdown()")  # Close it
            time.sleep(0.3)

            # 8. Advanced filters (click filter button)
            try:
                self.execute_js("toggleAdvancedFilters()")
                time.sleep(0.3)
                self.screenshot("p2p_08_advanced_filters", "Advanced filters panel")
                self.execute_js("toggleAdvancedFilters()")  # Close
            except:
                self.results.append(("p2p_08_advanced_filters", "SKIPPED", "No advanced filters"))

            # === MODALS ===
            print("\n--- Modals ---")

            # 9. Create Order Modal (Sell)
            self.open_modal_and_screenshot(
                "showCreateOrder()",
                "create-order-modal",
                "p2p_09_create_order_modal",
                "Create Order modal (sell side)"
            )

            # 10. Create Order Modal (Buy side) - switch to sell in main, then open
            self.execute_js("setSide('sell')")
            time.sleep(0.3)
            self.open_modal_and_screenshot(
                "showCreateOrder()",
                "create-order-modal",
                "p2p_10_create_order_buy_modal",
                "Create Order modal (buy side)"
            )
            self.execute_js("setSide('buy')")

            # 11. Trade Modal - need to simulate clicking on an order
            # Show modal directly if possible
            self.execute_js("document.getElementById('trade-modal').classList.add('active')")
            time.sleep(0.3)
            self.screenshot("p2p_11_trade_modal", "Trade initiation modal")
            self.execute_js("document.getElementById('trade-modal').classList.remove('active')")

            # 12. My Trades Modal
            self.open_modal_and_screenshot(
                "showMyTrades()",
                "my-trades-modal",
                "p2p_12_my_trades_modal",
                "My Trades modal"
            )

            # 13. Escrow Staking Modal
            self.open_modal_and_screenshot(
                "showEscrowStaking()",
                "escrow-modal",
                "p2p_13_escrow_staking_modal",
                "Escrow Staking modal"
            )

            # 14. Register Modal
            self.open_modal_and_screenshot(
                "showRegistrationModal()",
                "register-modal",
                "p2p_14_register_modal",
                "Trader Registration modal"
            )

            # 15. Payment Methods Manager Modal
            self.open_modal_and_screenshot(
                "showPaymentMethodsManager()",
                "payment-methods-modal",
                "p2p_15_payment_methods_modal",
                "Payment Methods Manager modal"
            )

            # 16. Add Payment Method Modal
            self.open_modal_and_screenshot(
                "showAddPaymentMethod()",
                "add-payment-modal",
                "p2p_16_add_payment_modal",
                "Add Payment Method modal"
            )

            # 17. Dispute Center Modal
            self.open_modal_and_screenshot(
                "showDisputeCenter()",
                "dispute-modal",
                "p2p_17_dispute_center_modal",
                "Dispute Center modal"
            )

            # 18. Open Dispute Modal
            self.execute_js("document.getElementById('open-dispute-modal').classList.add('active')")
            time.sleep(0.3)
            self.screenshot("p2p_18_open_dispute_modal", "Open Dispute modal")
            self.execute_js("document.getElementById('open-dispute-modal').classList.remove('active')")

            # 19. Trader Profile Modal
            self.execute_js("document.getElementById('trader-profile-modal').classList.add('active')")
            time.sleep(0.3)
            self.screenshot("p2p_19_trader_profile_modal", "Trader Profile modal")
            self.execute_js("document.getElementById('trader-profile-modal').classList.remove('active')")

            # 20. Global Stats Modal
            self.open_modal_and_screenshot(
                "showGlobalStats()",
                "global-stats-modal",
                "p2p_20_global_stats_modal",
                "Global Statistics modal"
            )

            # 21. Active Trade Modal
            self.execute_js("document.getElementById('active-trade-modal').classList.add('active')")
            time.sleep(0.3)
            self.screenshot("p2p_21_active_trade_modal", "Active Trade View modal")
            self.execute_js("document.getElementById('active-trade-modal').classList.remove('active')")

            # 22. Transaction Confirmation Modal
            self.execute_js("document.getElementById('tx-confirm-modal').classList.add('active')")
            time.sleep(0.3)
            self.screenshot("p2p_22_tx_confirm_modal", "Transaction Confirmation modal")
            self.execute_js("document.getElementById('tx-confirm-modal').classList.remove('active')")

            # 23. Claim Modal
            self.execute_js("document.getElementById('claim-modal').classList.add('active')")
            time.sleep(0.3)
            self.screenshot("p2p_23_claim_modal", "Claim modal")
            self.execute_js("document.getElementById('claim-modal').classList.remove('active')")

            # 24. Manager Panel Modal
            self.open_modal_and_screenshot(
                "showManagerPanel()",
                "manager-panel-modal",
                "p2p_24_manager_panel_modal",
                "Manager Panel modal"
            )

            # 25. Help Modal
            self.open_modal_and_screenshot(
                "showHelp()",
                "help-modal",
                "p2p_25_help_modal",
                "Help/Education modal"
            )

            # 26. Telegram Settings Modal
            self.open_modal_and_screenshot(
                "showTelegramSettings()",
                "telegram-settings-modal",
                "p2p_26_telegram_settings_modal",
                "Telegram Settings modal"
            )

            # === SPECIAL STATES ===
            print("\n--- Special States ---")

            # 27. Registration Banner
            self.execute_js("document.getElementById('registration-banner').style.display = 'flex'")
            time.sleep(0.3)
            self.screenshot("p2p_27_registration_banner", "Registration banner visible")
            self.execute_js("document.getElementById('registration-banner').style.display = 'none'")

            # 28. Role badges visible
            self.execute_js("""
                document.getElementById('badge-owner').style.display = 'inline-flex';
                document.getElementById('badge-manager').style.display = 'inline-flex';
                document.getElementById('badge-escrow').style.display = 'inline-flex';
                document.getElementById('badge-trader').style.display = 'inline-flex';
            """)
            time.sleep(0.3)
            self.screenshot("p2p_28_role_badges", "All role badges visible")

            # 29. Full page with orders (if any loaded)
            self.screenshot("p2p_29_full_page", "Full page final state")

        except Exception as e:
            print(f"\nFATAL ERROR: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # Don't quit if connected to existing browser
            if self.headless and self.driver:
                self.driver.quit()

        # Print summary
        self.print_summary()
        return True

    def print_summary(self):
        """Print test summary."""
        print("\n" + "="*60)
        print("SCREENSHOT SUMMARY")
        print("="*60)

        success = sum(1 for r in self.results if r[1] == "SUCCESS")
        failed = sum(1 for r in self.results if r[1] == "FAILED")
        skipped = sum(1 for r in self.results if r[1] == "SKIPPED")

        print(f"\nTotal: {len(self.results)}")
        print(f"Success: {success}")
        print(f"Failed: {failed}")
        print(f"Skipped: {skipped}")

        if failed > 0:
            print("\nFailed screenshots:")
            for name, status, msg in self.results:
                if status == "FAILED":
                    print(f"  - {name}: {msg}")

        print(f"\nScreenshots saved to: {SCREENSHOT_DIR}")


def main():
    headless = "--headless" in sys.argv
    test = P2PScreenshotTest(headless=headless)
    test.run_tests()


if __name__ == "__main__":
    main()
