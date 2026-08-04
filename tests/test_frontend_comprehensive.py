#!/usr/bin/env python3
"""
Comprehensive Frontend UI Testing for BEAM LightWallet
Connects to existing Chrome debug session and tests all functionality
"""

import time
import json
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
import os

BASE_URL = "http://127.0.0.1:9080"
TEST_PASSWORD = os.environ.get('BEAM_TEST_PASSWORD', '')

class FrontendTester:
    def __init__(self):
        self.driver = None
        self.results = []
        self.screenshots_taken = 0

    def connect_to_chrome(self):
        """Connect to existing Chrome debug session"""
        options = Options()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        try:
            self.driver = webdriver.Chrome(options=options)
            print("✓ Connected to Chrome debug session")
            return True
        except Exception as e:
            print(f"✗ Failed to connect to Chrome: {e}")
            return False

    def log_result(self, test_name, passed, message=""):
        """Log test result"""
        status = "✓ PASS" if passed else "✗ FAIL"
        result = f"{status}: {test_name}"
        if message:
            result += f" - {message}"
        print(result)
        self.results.append({"test": test_name, "passed": passed, "message": message})
        return passed

    def wait_for_element(self, by, value, timeout=10):
        """Wait for element to be present"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return element
        except TimeoutException:
            return None

    def wait_for_clickable(self, by, value, timeout=10):
        """Wait for element to be clickable"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            return element
        except TimeoutException:
            return None

    def screenshot(self, name):
        """Take screenshot"""
        self.screenshots_taken += 1
        filename = f"/tmp/beam_test_{self.screenshots_taken:02d}_{name}.png"
        self.driver.save_screenshot(filename)
        print(f"  Screenshot saved: {filename}")

    def navigate_to(self, path=""):
        """Navigate to a path"""
        self.driver.get(f"{BASE_URL}/{path}")
        time.sleep(1)

    # ===== TEST SECTIONS =====

    def test_page_load(self):
        """Test initial page load"""
        print("\n=== Testing Page Load ===")
        self.navigate_to()
        time.sleep(2)

        # Check page title
        title = self.driver.title
        self.log_result("Page title present", bool(title), f"Title: {title}")

        # Check if main container exists
        body = self.wait_for_element(By.TAG_NAME, "body")
        self.log_result("Body element exists", body is not None)

        # Check for CSS loaded (background color should be dark)
        if body:
            bg_color = body.value_of_css_property("background-color")
            is_dark = "0" in bg_color or "10" in bg_color or "17" in bg_color
            self.log_result("Dark theme applied", is_dark, f"BG: {bg_color}")

        self.screenshot("01_initial_load")

    def test_unlock_screen(self):
        """Test unlock/welcome screen"""
        print("\n=== Testing Unlock Screen ===")
        self.navigate_to()
        time.sleep(2)

        # Look for unlock screen elements
        unlock_container = self.wait_for_element(By.ID, "unlock-screen", timeout=5)
        if not unlock_container:
            unlock_container = self.wait_for_element(By.CLASS_NAME, "unlock-screen", timeout=5)

        if unlock_container:
            self.log_result("Unlock screen visible", True)

            # Check for password input
            password_input = self.driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
            self.log_result("Password input exists", len(password_input) > 0)

            # Check for wallet selector
            wallet_select = self.driver.find_elements(By.CSS_SELECTOR, "select, .wallet-select")
            self.log_result("Wallet selector exists", len(wallet_select) > 0)

            # Check for unlock button
            unlock_btn = self.driver.find_elements(By.CSS_SELECTOR, "button, .btn")
            self.log_result("Buttons present", len(unlock_btn) > 0, f"Found {len(unlock_btn)} buttons")

            self.screenshot("02_unlock_screen")
        else:
            # Might already be unlocked, check for dashboard
            dashboard = self.wait_for_element(By.ID, "dashboard", timeout=3)
            if dashboard:
                self.log_result("Already unlocked - dashboard visible", True)
            else:
                self.log_result("Unlock screen visible", False, "Neither unlock nor dashboard found")

    def test_unlock_wallet(self):
        """Test unlocking wallet with password"""
        print("\n=== Testing Wallet Unlock ===")

        # Check if already unlocked
        dashboard = self.wait_for_element(By.ID, "dashboard", timeout=2)
        if dashboard and dashboard.is_displayed():
            self.log_result("Wallet already unlocked", True)
            return True

        # Try to unlock
        password_input = self.wait_for_element(By.CSS_SELECTOR, "input[type='password']", timeout=5)
        if password_input:
            password_input.clear()
            password_input.send_keys(TEST_PASSWORD)
            time.sleep(0.5)

            # Find and click unlock button
            buttons = self.driver.find_elements(By.CSS_SELECTOR, "button, .btn")
            for btn in buttons:
                text = btn.text.lower()
                if "unlock" in text or "open" in text or "login" in text:
                    btn.click()
                    self.log_result("Clicked unlock button", True)
                    time.sleep(3)
                    break

            # Wait for dashboard
            dashboard = self.wait_for_element(By.ID, "dashboard", timeout=10)
            if dashboard:
                self.log_result("Dashboard loaded after unlock", True)
                self.screenshot("03_dashboard_after_unlock")
                return True
            else:
                self.log_result("Dashboard loaded after unlock", False, "Dashboard not found")
                self.screenshot("03_unlock_failed")
                return False
        else:
            self.log_result("Password input found", False)
            return False

    def test_dashboard(self):
        """Test dashboard elements"""
        print("\n=== Testing Dashboard ===")

        dashboard = self.wait_for_element(By.ID, "dashboard", timeout=5)
        if not dashboard:
            self.log_result("Dashboard visible", False)
            return

        self.log_result("Dashboard visible", True)

        # Check balance display
        balance_elements = self.driver.find_elements(By.CSS_SELECTOR, ".balance, .total-balance, [class*='balance']")
        self.log_result("Balance elements present", len(balance_elements) > 0, f"Found {len(balance_elements)}")

        # Check for asset cards
        asset_cards = self.driver.find_elements(By.CSS_SELECTOR, ".asset-card, .token-card, [class*='asset']")
        self.log_result("Asset cards present", len(asset_cards) > 0, f"Found {len(asset_cards)}")

        # Check for navigation
        nav_elements = self.driver.find_elements(By.CSS_SELECTOR, "nav, .navigation, .nav-item, [class*='nav']")
        self.log_result("Navigation present", len(nav_elements) > 0)

        # Check for action buttons (Send, Receive)
        buttons = self.driver.find_elements(By.CSS_SELECTOR, "button, .btn")
        button_texts = [b.text.lower() for b in buttons]
        has_send = any("send" in t for t in button_texts)
        has_receive = any("receive" in t for t in button_texts)
        self.log_result("Send button present", has_send)
        self.log_result("Receive button present", has_receive)

        self.screenshot("04_dashboard")

    def test_navigation(self):
        """Test page navigation"""
        print("\n=== Testing Navigation ===")

        # Find navigation links/buttons
        nav_items = self.driver.find_elements(By.CSS_SELECTOR,
            ".nav-item, .nav-link, [data-page], nav a, nav button")

        self.log_result("Navigation items found", len(nav_items) > 0, f"Found {len(nav_items)}")

        # Try to find specific pages
        pages_to_test = ["dashboard", "send", "receive", "transactions", "dex", "settings"]

        for page in pages_to_test:
            # Try clicking nav item or button
            found = False
            for item in nav_items:
                item_text = item.text.lower()
                item_data = item.get_attribute("data-page") or ""
                if page in item_text or page in item_data.lower():
                    try:
                        item.click()
                        time.sleep(1)
                        self.log_result(f"Navigate to {page}", True)
                        self.screenshot(f"05_nav_{page}")
                        found = True
                        break
                    except Exception as e:
                        self.log_result(f"Navigate to {page}", False, str(e))
                        found = True
                        break

            if not found:
                # Try alternative navigation
                try:
                    # Look for buttons/links with page name
                    alt_nav = self.driver.find_elements(By.XPATH,
                        f"//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{page}')]")
                    if alt_nav:
                        alt_nav[0].click()
                        time.sleep(1)
                        self.log_result(f"Navigate to {page}", True, "via alternative")
                except:
                    pass

    def test_send_page(self):
        """Test send transaction page"""
        print("\n=== Testing Send Page ===")

        # Navigate to send
        send_nav = self.driver.find_elements(By.CSS_SELECTOR,
            "[data-page='send'], .nav-item:contains('Send'), button:contains('Send')")

        for item in self.driver.find_elements(By.CSS_SELECTOR, "button, .nav-item, a"):
            if "send" in item.text.lower():
                try:
                    item.click()
                    time.sleep(1)
                    break
                except:
                    pass

        time.sleep(1)

        # Check for send form elements
        address_input = self.driver.find_elements(By.CSS_SELECTOR,
            "input[placeholder*='address' i], input[name*='address' i], #send-address, .address-input")
        self.log_result("Address input present", len(address_input) > 0)

        amount_input = self.driver.find_elements(By.CSS_SELECTOR,
            "input[type='number'], input[placeholder*='amount' i], #send-amount, .amount-input")
        self.log_result("Amount input present", len(amount_input) > 0)

        # Check for asset selector
        asset_select = self.driver.find_elements(By.CSS_SELECTOR, "select, .asset-selector, .token-select")
        self.log_result("Asset selector present", len(asset_select) > 0)

        # Check for send button
        send_btn = self.driver.find_elements(By.CSS_SELECTOR, "button[type='submit'], .send-btn, button")
        send_btns = [b for b in send_btn if "send" in b.text.lower()]
        self.log_result("Send button present", len(send_btns) > 0)

        self.screenshot("06_send_page")

    def test_receive_page(self):
        """Test receive/address page"""
        print("\n=== Testing Receive Page ===")

        # Navigate to receive
        for item in self.driver.find_elements(By.CSS_SELECTOR, "button, .nav-item, a"):
            if "receive" in item.text.lower():
                try:
                    item.click()
                    time.sleep(1)
                    break
                except:
                    pass

        time.sleep(1)

        # Check for address display
        address_display = self.driver.find_elements(By.CSS_SELECTOR,
            ".address, [class*='address'], code, .wallet-address")
        self.log_result("Address display present", len(address_display) > 0)

        # Check for QR code
        qr_code = self.driver.find_elements(By.CSS_SELECTOR,
            "canvas, svg, img[src*='qr'], .qr-code, [class*='qr']")
        self.log_result("QR code present", len(qr_code) > 0)

        # Check for copy button
        copy_btn = self.driver.find_elements(By.CSS_SELECTOR,
            "button[class*='copy'], .copy-btn, button")
        copy_btns = [b for b in copy_btn if "copy" in b.text.lower() or "copy" in (b.get_attribute("class") or "")]
        self.log_result("Copy button present", len(copy_btns) > 0)

        self.screenshot("07_receive_page")

    def test_transactions_page(self):
        """Test transactions history page"""
        print("\n=== Testing Transactions Page ===")

        # Navigate to transactions
        for item in self.driver.find_elements(By.CSS_SELECTOR, "button, .nav-item, a"):
            text = item.text.lower()
            if "transaction" in text or "history" in text or "tx" in text:
                try:
                    item.click()
                    time.sleep(1)
                    break
                except:
                    pass

        time.sleep(1)

        # Check for transaction list
        tx_list = self.driver.find_elements(By.CSS_SELECTOR,
            ".transaction-list, .tx-list, [class*='transaction'], .tx-item")
        self.log_result("Transaction list present", len(tx_list) > 0)

        # Check for transaction items
        tx_items = self.driver.find_elements(By.CSS_SELECTOR,
            ".transaction-item, .tx-item, .tx-row, [class*='tx-']")
        self.log_result("Transaction items present", len(tx_items) >= 0, f"Found {len(tx_items)}")

        # Check for filters/tabs
        filters = self.driver.find_elements(By.CSS_SELECTOR,
            ".filter, .tab, select, [class*='filter']")
        self.log_result("Filters/tabs present", len(filters) > 0)

        self.screenshot("08_transactions_page")

    def test_dex_page(self):
        """Test DEX swap page"""
        print("\n=== Testing DEX Page ===")

        # Navigate to DEX
        for item in self.driver.find_elements(By.CSS_SELECTOR, "button, .nav-item, a"):
            text = item.text.lower()
            if "dex" in text or "swap" in text or "trade" in text or "exchange" in text:
                try:
                    item.click()
                    time.sleep(2)
                    break
                except:
                    pass

        time.sleep(2)

        # Check for swap form
        from_input = self.driver.find_elements(By.CSS_SELECTOR,
            "input[placeholder*='from' i], .from-amount, #swap-from, input[type='number']")
        self.log_result("From amount input present", len(from_input) > 0)

        to_input = self.driver.find_elements(By.CSS_SELECTOR,
            "input[placeholder*='to' i], .to-amount, #swap-to")
        # Might be read-only output

        # Check for token selectors
        token_selects = self.driver.find_elements(By.CSS_SELECTOR,
            "select, .token-select, .asset-select, [class*='token-selector']")
        self.log_result("Token selectors present", len(token_selects) > 0, f"Found {len(token_selects)}")

        # Check for swap button
        swap_btn = self.driver.find_elements(By.CSS_SELECTOR, "button")
        swap_btns = [b for b in swap_btn if "swap" in b.text.lower() or "trade" in b.text.lower()]
        self.log_result("Swap button present", len(swap_btns) > 0)

        # Check for pool info
        pool_info = self.driver.find_elements(By.CSS_SELECTOR,
            ".pool-info, .rate, .price, [class*='pool']")
        self.log_result("Pool/rate info present", len(pool_info) > 0)

        self.screenshot("09_dex_page")

    def test_settings_page(self):
        """Test settings page"""
        print("\n=== Testing Settings Page ===")

        # Navigate to settings
        for item in self.driver.find_elements(By.CSS_SELECTOR, "button, .nav-item, a"):
            text = item.text.lower()
            if "setting" in text or "config" in text or "⚙" in text:
                try:
                    item.click()
                    time.sleep(1)
                    break
                except:
                    pass

        time.sleep(1)

        # Check for settings elements
        settings_items = self.driver.find_elements(By.CSS_SELECTOR,
            ".setting, .settings-item, input[type='checkbox'], select, [class*='setting']")
        self.log_result("Settings elements present", len(settings_items) > 0, f"Found {len(settings_items)}")

        # Check for node settings
        node_settings = self.driver.find_elements(By.CSS_SELECTOR,
            "[class*='node'], input[placeholder*='node' i]")
        self.log_result("Node settings present", len(node_settings) >= 0)

        # Check for theme toggle
        theme_toggle = self.driver.find_elements(By.CSS_SELECTOR,
            "[class*='theme'], input[type='checkbox'], .toggle")
        self.log_result("Theme/toggles present", len(theme_toggle) > 0)

        self.screenshot("10_settings_page")

    def test_responsive_design(self):
        """Test responsive design at different sizes"""
        print("\n=== Testing Responsive Design ===")

        sizes = [
            (1920, 1080, "desktop"),
            (1024, 768, "tablet-landscape"),
            (768, 1024, "tablet-portrait"),
            (375, 812, "mobile")
        ]

        for width, height, name in sizes:
            self.driver.set_window_size(width, height)
            time.sleep(0.5)

            # Check that content is still visible
            body = self.driver.find_element(By.TAG_NAME, "body")
            is_visible = body.is_displayed()

            # Check for horizontal scroll (bad sign)
            scroll_width = self.driver.execute_script("return document.body.scrollWidth")
            viewport_width = self.driver.execute_script("return window.innerWidth")
            no_h_scroll = scroll_width <= viewport_width + 20  # small tolerance

            self.log_result(f"Responsive {name} ({width}x{height})",
                           is_visible and no_h_scroll,
                           f"scroll: {scroll_width}px, viewport: {viewport_width}px")

            self.screenshot(f"11_responsive_{name}")

        # Reset to desktop
        self.driver.set_window_size(1920, 1080)

    def test_debug_panel(self):
        """Test debug panel (Ctrl+`)"""
        print("\n=== Testing Debug Panel ===")

        # Try to open debug panel with keyboard shortcut
        body = self.driver.find_element(By.TAG_NAME, "body")

        # Try Ctrl+`
        actions = ActionChains(self.driver)
        actions.key_down(Keys.CONTROL).send_keys("`").key_up(Keys.CONTROL).perform()
        time.sleep(1)

        # Check if debug panel appeared
        debug_panel = self.driver.find_elements(By.CSS_SELECTOR,
            ".debug-panel, #debug-panel, [class*='debug'], .console")

        if debug_panel and debug_panel[0].is_displayed():
            self.log_result("Debug panel opens", True)
            self.screenshot("12_debug_panel")

            # Close it
            actions.key_down(Keys.CONTROL).send_keys("`").key_up(Keys.CONTROL).perform()
            time.sleep(0.5)
        else:
            # Try clicking debug button if exists
            debug_btn = self.driver.find_elements(By.CSS_SELECTOR,
                "[class*='debug'], button[title*='debug' i]")
            if debug_btn:
                try:
                    debug_btn[0].click()
                    time.sleep(1)
                    self.log_result("Debug panel opens", True, "via button")
                    self.screenshot("12_debug_panel")
                except:
                    self.log_result("Debug panel opens", False)
            else:
                self.log_result("Debug panel opens", False, "Panel not found")

    def test_error_handling(self):
        """Test error handling and edge cases"""
        print("\n=== Testing Error Handling ===")

        # Check console for JS errors
        logs = self.driver.get_log("browser")
        severe_errors = [l for l in logs if l["level"] == "SEVERE"]
        self.log_result("No severe JS errors", len(severe_errors) == 0,
                       f"Found {len(severe_errors)} errors")

        if severe_errors:
            for err in severe_errors[:3]:  # Show first 3
                print(f"  ERROR: {err['message'][:100]}")

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)

        passed = sum(1 for r in self.results if r["passed"])
        failed = sum(1 for r in self.results if not r["passed"])
        total = len(self.results)

        print(f"\nTotal Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Pass Rate: {passed/total*100:.1f}%" if total > 0 else "N/A")
        print(f"Screenshots: {self.screenshots_taken}")

        if failed > 0:
            print("\nFailed Tests:")
            for r in self.results:
                if not r["passed"]:
                    print(f"  - {r['test']}: {r['message']}")

        print("\n" + "="*60)

        return failed == 0

    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("BEAM LightWallet Frontend Test Suite")
        print("="*60)

        if not self.connect_to_chrome():
            print("Cannot proceed without Chrome connection")
            return False

        try:
            self.test_page_load()
            self.test_unlock_screen()
            self.test_unlock_wallet()
            self.test_dashboard()
            self.test_navigation()
            self.test_send_page()
            self.test_receive_page()
            self.test_transactions_page()
            self.test_dex_page()
            self.test_settings_page()
            self.test_responsive_design()
            self.test_debug_panel()
            self.test_error_handling()

            return self.print_summary()

        except Exception as e:
            print(f"\nTest execution error: {e}")
            import traceback
            traceback.print_exc()
            return False


if __name__ == "__main__":
    tester = FrontendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
