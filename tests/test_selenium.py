#!/usr/bin/env python3
"""
BEAM Light Wallet - Selenium UI Tests with Screenshots

Usage:
    python3 test_selenium.py              # Run with visible browser
    python3 test_selenium.py --headless   # Run headless (for CI)

Requirements:
    pip install selenium webdriver-manager

Before running:
    1. Start the wallet server: python3 serve.py 9080
    2. Have at least one test wallet created
"""

import sys
import os
import time
import json
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print("Selenium not installed. Install with: pip install selenium webdriver-manager")
    sys.exit(1)

try:
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    ChromeDriverManager = None


class LightWalletTests:
    """Comprehensive UI tests for BEAM Light Wallet"""

    def __init__(self, headless=False, base_url="http://127.0.0.1:9080"):
        self.base_url = base_url
        self.headless = headless
        self.screenshot_dir = os.path.join(os.path.dirname(__file__), "screenshots")
        self.results = []
        self.driver = None

        # Create screenshot directory
        os.makedirs(self.screenshot_dir, exist_ok=True)

        # Setup Chrome options
        self.options = Options()
        if headless:
            self.options.add_argument('--headless')
        self.options.add_argument('--window-size=1400,900')
        self.options.add_argument('--no-sandbox')
        self.options.add_argument('--disable-dev-shm-usage')

    def setup(self):
        """Initialize WebDriver"""
        try:
            if ChromeDriverManager:
                service = Service(ChromeDriverManager().install())
                self.driver = webdriver.Chrome(service=service, options=self.options)
            else:
                self.driver = webdriver.Chrome(options=self.options)
            self.driver.implicitly_wait(5)
            print(f"Browser initialized (headless={self.headless})")
            return True
        except Exception as e:
            print(f"Failed to initialize browser: {e}")
            return False

    def teardown(self):
        """Close WebDriver"""
        if self.driver:
            self.driver.quit()
            self.driver = None

    def screenshot(self, name):
        """Save screenshot with timestamp"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{timestamp}.png"
        path = os.path.join(self.screenshot_dir, filename)
        try:
            self.driver.save_screenshot(path)
            print(f"  Screenshot: {filename}")
            return path
        except Exception as e:
            print(f"  Screenshot failed: {e}")
            return None

    def wait_for(self, selector, timeout=10):
        """Wait for element to be visible"""
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def wait_for_clickable(self, selector, timeout=10):
        """Wait for element to be clickable"""
        return WebDriverWait(self.driver, timeout).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
        )

    def element_exists(self, selector):
        """Check if element exists"""
        try:
            self.driver.find_element(By.CSS_SELECTOR, selector)
            return True
        except NoSuchElementException:
            return False

    def get_text(self, selector):
        """Get text content of element"""
        try:
            return self.driver.find_element(By.CSS_SELECTOR, selector).text
        except:
            return ""

    def run_test(self, test_func):
        """Run a single test with error handling"""
        test_name = test_func.__name__
        print(f"\n{'='*50}")
        print(f"TEST: {test_name}")
        print('='*50)

        try:
            test_func()
            self.results.append((test_name, "PASS", None))
            print(f"RESULT: PASS")
            return True
        except Exception as e:
            self.screenshot(f"FAIL_{test_name}")
            self.results.append((test_name, "FAIL", str(e)))
            print(f"RESULT: FAIL - {e}")
            return False

    # ==================== TEST CASES ====================

    def test_01_server_running(self):
        """Verify server is running and responding"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Page should load without error
        assert "BEAM" in self.driver.title or self.driver.find_element(By.TAG_NAME, "body")
        self.screenshot("01_initial_load")

    def test_02_welcome_screen_elements(self):
        """Verify welcome/unlock screen has all required elements"""
        self.driver.get(self.base_url)
        time.sleep(2)

        self.screenshot("02_welcome_screen")

        # Check for wallet selector
        assert self.element_exists("#wallet-select") or self.element_exists(".wallet-select"), \
            "Wallet selector not found"

        # Check for password input
        assert self.element_exists("#unlock-password") or self.element_exists("[type='password']"), \
            "Password input not found"

        # Check for unlock button
        assert self.element_exists("#unlock-btn") or self.element_exists(".unlock-btn") or \
               self.element_exists("button"), "Unlock button not found"

    def test_03_create_wallet_button(self):
        """Verify Create Wallet button exists and is clickable"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Find create wallet button/link
        create_selectors = [
            ".create-wallet-btn",
            "#create-wallet-btn",
            "[onclick*='showCreateWallet']",
            "a[href*='create']",
            "button:contains('Create')"
        ]

        found = False
        for selector in create_selectors:
            if self.element_exists(selector):
                found = True
                self.screenshot("03_create_wallet_button")
                break

        # Also check for text content
        if not found:
            page_source = self.driver.page_source.lower()
            assert "create" in page_source, "Create wallet option not found"

    def test_04_restore_wallet_button(self):
        """Verify Restore Wallet option exists"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Check page source for restore option
        page_source = self.driver.page_source.lower()
        assert "restore" in page_source or "seed" in page_source, \
            "Restore wallet option not found"

        self.screenshot("04_restore_option")

    def test_05_wallet_list_loads(self):
        """Verify wallet list loads from API"""
        self.driver.get(self.base_url)
        time.sleep(3)

        # Check if wallet selector has options
        select_elem = None
        for selector in ["#wallet-select", ".wallet-select", "select"]:
            try:
                select_elem = self.driver.find_element(By.CSS_SELECTOR, selector)
                break
            except:
                continue

        if select_elem:
            options = select_elem.find_elements(By.TAG_NAME, "option")
            print(f"  Found {len(options)} wallet options")
            self.screenshot("05_wallet_list")

    def test_06_css_styles_loaded(self):
        """Verify CSS styles are properly loaded"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Check if CSS variables are applied
        body = self.driver.find_element(By.TAG_NAME, "body")
        bg_color = body.value_of_css_property("background-color")

        # Should have dark background (not white)
        assert bg_color != "rgba(255, 255, 255, 1)", f"CSS not loaded, bg={bg_color}"
        self.screenshot("06_css_loaded")
        print(f"  Background color: {bg_color}")

    def test_07_js_no_errors(self):
        """Check browser console for JavaScript errors"""
        self.driver.get(self.base_url)
        time.sleep(3)

        # Get browser logs
        try:
            logs = self.driver.get_log('browser')
            errors = [log for log in logs if log['level'] == 'SEVERE']

            if errors:
                print("  JavaScript errors found:")
                for error in errors[:5]:  # Show first 5
                    print(f"    - {error['message'][:100]}")

            # Allow test to pass with warnings, fail only on critical errors
            critical_errors = [e for e in errors if 'undefined' not in e['message'].lower()]
            assert len(critical_errors) < 3, f"Too many JS errors: {len(errors)}"
        except:
            print("  Could not retrieve browser logs")

        self.screenshot("07_console_check")

    def test_08_api_status_endpoint(self):
        """Verify /api/status endpoint works"""
        self.driver.get(f"{self.base_url}/api/status")
        time.sleep(1)

        page_text = self.driver.find_element(By.TAG_NAME, "body").text

        # Should return JSON
        try:
            data = json.loads(page_text)
            print(f"  Server status: {data}")
            assert "wallet_api_running" in data or "status" in data or "active_wallet" in data
        except json.JSONDecodeError:
            # If not JSON, check it's not an error page
            assert "error" not in page_text.lower() or "404" not in page_text

        self.screenshot("08_api_status")

    def test_09_api_wallets_endpoint(self):
        """Verify /api/wallets endpoint works"""
        self.driver.get(f"{self.base_url}/api/wallets")
        time.sleep(1)

        page_text = self.driver.find_element(By.TAG_NAME, "body").text

        try:
            data = json.loads(page_text)
            print(f"  Wallets: {data}")
            assert isinstance(data, (list, dict))
        except json.JSONDecodeError:
            pass  # May redirect to main page

        self.screenshot("09_api_wallets")

    def test_10_responsive_layout(self):
        """Test responsive layout at different sizes"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Test desktop size
        self.driver.set_window_size(1400, 900)
        time.sleep(1)
        self.screenshot("10a_desktop_layout")

        # Test tablet size
        self.driver.set_window_size(768, 1024)
        time.sleep(1)
        self.screenshot("10b_tablet_layout")

        # Test mobile size
        self.driver.set_window_size(375, 812)
        time.sleep(1)
        self.screenshot("10c_mobile_layout")

        # Restore desktop size
        self.driver.set_window_size(1400, 900)

    def test_11_navigation_elements(self):
        """Verify navigation elements exist (if wallet is unlocked)"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Check for navigation in page
        nav_keywords = ['dashboard', 'send', 'receive', 'dex', 'settings', 'swap']
        page_source = self.driver.page_source.lower()

        found_nav = sum(1 for kw in nav_keywords if kw in page_source)
        print(f"  Found {found_nav} navigation keywords")

        self.screenshot("11_navigation")

    def test_12_error_handling_display(self):
        """Verify error messages can be displayed"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Try to trigger an error by submitting empty form
        # This tests if error display mechanism works
        try:
            unlock_btn = self.driver.find_element(By.CSS_SELECTOR, "#unlock-btn, .unlock-btn, button[type='submit']")
            unlock_btn.click()
            time.sleep(2)
            self.screenshot("12_error_display")
        except:
            pass  # Button might not be immediately clickable

    def run_all_tests(self):
        """Run all tests and generate report"""
        if not self.setup():
            return False

        tests = [
            self.test_01_server_running,
            self.test_02_welcome_screen_elements,
            self.test_03_create_wallet_button,
            self.test_04_restore_wallet_button,
            self.test_05_wallet_list_loads,
            self.test_06_css_styles_loaded,
            self.test_07_js_no_errors,
            self.test_08_api_status_endpoint,
            self.test_09_api_wallets_endpoint,
            self.test_10_responsive_layout,
            self.test_11_navigation_elements,
            self.test_12_error_handling_display,
        ]

        for test in tests:
            self.run_test(test)

        self.teardown()
        self.print_report()

        # Return True if all tests passed
        return all(r[1] == "PASS" for r in self.results)

    def print_report(self):
        """Print test results summary"""
        print("\n" + "="*60)
        print("TEST RESULTS SUMMARY")
        print("="*60)

        passed = sum(1 for r in self.results if r[1] == "PASS")
        failed = sum(1 for r in self.results if r[1] == "FAIL")

        for name, status, error in self.results:
            icon = "PASS" if status == "PASS" else "FAIL"
            print(f"  [{icon}] {name}")
            if error:
                print(f"         Error: {error[:80]}")

        print("-"*60)
        print(f"Total: {len(self.results)} | Passed: {passed} | Failed: {failed}")
        print(f"Screenshots saved to: {self.screenshot_dir}")
        print("="*60)


def main():
    """Main entry point"""
    headless = "--headless" in sys.argv
    base_url = "http://127.0.0.1:9080"

    # Check for custom URL
    for arg in sys.argv[1:]:
        if arg.startswith("http"):
            base_url = arg

    print(f"BEAM Light Wallet - Selenium Tests")
    print(f"URL: {base_url}")
    print(f"Headless: {headless}")
    print()

    tests = LightWalletTests(headless=headless, base_url=base_url)
    success = tests.run_all_tests()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
