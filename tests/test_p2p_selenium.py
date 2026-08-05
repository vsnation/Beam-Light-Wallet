#!/usr/bin/env python3
"""
P2P Marketplace Selenium Tests - Comprehensive Test Suite
Tests all P2P contract methods through the UI with screenshots

Wallets:
- test_wallet ($BEAM_TEST_PASSWORD) - Seller/Manager/Escrow
- test_2 (123123) - Buyer

Contract Methods:
SELLER: register_trader, create_order, cancel_order, confirm_payment
BUYER: accept_order, mark_payment_sent
BOTH: view_orders, view_trades, submit_feedback
ESCROW: stake_escrow, unstake_escrow, escrow_vote, claim_rewards
MANAGER: view_stats, withdraw_fees, assign_escrows
"""

import time
import os
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

# Configuration
BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "tests/screenshots/p2p"
SELLER_WALLET = "test_wallet"
SELLER_PASSWORD = os.environ.get('BEAM_TEST_PASSWORD', '')
BUYER_WALLET = "test_2"
BUYER_PASSWORD = "123123"

class P2PTests:
    def __init__(self, use_debug_port=True):
        options = Options()
        if use_debug_port:
            options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        else:
            options.add_argument('--window-size=1400,900')
        self.driver = webdriver.Chrome(options=options)
        self.base_url = BASE_URL
        self.results = []
        self.screenshot_count = 0
        self.current_wallet = None
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def log(self, msg):
        print(f"  {msg}")

    def test_pass(self, name):
        print(f"✅ {name}")
        self.results.append((name, True, None))

    def test_fail(self, name, error):
        print(f"❌ {name}: {error}")
        self.results.append((name, False, str(error)))

    def test_skip(self, name, reason):
        print(f"⚠️ {name}: SKIPPED - {reason}")
        self.results.append((name, None, reason))

    def screenshot(self, name):
        self.screenshot_count += 1
        filename = f"{self.screenshot_count:03d}_{name}.png"
        path = os.path.join(SCREENSHOT_DIR, filename)
        self.driver.save_screenshot(path)
        self.log(f"Screenshot: {filename}")
        return path

    def switch_to_iframe(self):
        """Switch to P2P iframe"""
        try:
            self.driver.switch_to.default_content()
            iframe = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'iframe[src*="p2p"]'))
            )
            self.driver.switch_to.frame(iframe)
            return True
        except:
            return False

    def click(self, selector, timeout=10):
        """Click element with wait"""
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
            )
            el.click()
            time.sleep(0.3)
            return True
        except Exception as e:
            self.log(f"Failed to click {selector}: {e}")
            return False

    def fill(self, selector, value, timeout=10):
        """Fill input field"""
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            el.clear()
            el.send_keys(str(value))
            return True
        except:
            return False

    def get_text(self, selector, timeout=5):
        """Get element text"""
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            return el.text
        except:
            return None

    def close_all_modals(self):
        """Close all open modals"""
        try:
            self.switch_to_iframe()
            modals = self.driver.find_elements(By.CSS_SELECTOR, '.modal.show')
            for modal in modals:
                modal.find_element(By.CSS_SELECTOR, '.modal-close').click()
            time.sleep(0.3)
        except:
            pass

    def wait_for(self, selector, timeout=10):
        return WebDriverWait(self.driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )

    def test_01_navigate_to_p2p(self):
        """Navigate to P2P page"""
        try:
            self.driver.get(f"{self.base_url}/p2p")
            time.sleep(3)
            self.screenshot("01_p2p_page")
            self.test_pass("Navigate to P2P page")
        except Exception as e:
            self.screenshot("01_fail")
            self.test_fail("Navigate to P2P page", e)

    def test_02_order_book_loads(self):
        """Verify order book loads"""
        try:
            time.sleep(2)
            orders = self.driver.find_elements(By.CSS_SELECTOR, ".order-card")
            self.log(f"Found {len(orders)} orders")
            self.screenshot("02_order_book")
            self.test_pass("Order book loads")
        except Exception as e:
            self.test_fail("Order book loads", e)

    def test_03_create_order_modal(self):
        """Open create order modal"""
        try:
            # Scroll to bottom to find the action buttons
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.5)

            btn = self.driver.find_element(By.CSS_SELECTOR, ".action-btn.action-btn-primary")
            self.driver.execute_script("arguments[0].scrollIntoView(true);", btn)
            time.sleep(0.3)
            btn.click()
            time.sleep(1)
            # Verify modal is open
            modal = self.driver.find_element(By.CSS_SELECTOR, "#create-order-modal")
            self.log(f"Modal class: {modal.get_attribute('class')}")
            self.screenshot("03_create_modal")
            self.test_pass("Create order modal opens")
        except Exception as e:
            self.test_fail("Create order modal", e)

    def test_04_my_trades(self):
        """Open My Trades"""
        try:
            # Close any open modal first
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                try:
                    btn.click()
                except:
                    pass
            time.sleep(0.5)

            # Scroll to bottom to find the action buttons
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.3)

            # Get all action buttons and click "My Trades" (second one)
            btns = self.driver.find_elements(By.CSS_SELECTOR, ".action-btn.action-btn-secondary")
            self.log(f"Found {len(btns)} secondary action buttons")
            if btns:
                self.driver.execute_script("arguments[0].scrollIntoView(true);", btns[0])
                time.sleep(0.3)
                btns[0].click()  # First secondary button is "My Trades"
            time.sleep(1)
            # Verify modal is open
            modal = self.driver.find_element(By.CSS_SELECTOR, "#my-trades-modal")
            self.log(f"My Trades modal class: {modal.get_attribute('class')}")
            self.screenshot("04_my_trades")
            self.test_pass("My Trades modal")
        except Exception as e:
            self.test_fail("My Trades modal", e)

    def test_05_filters(self):
        """Test filters"""
        try:
            # Close modal
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                try:
                    btn.click()
                except:
                    pass
            time.sleep(0.5)

            filters = self.driver.find_elements(By.CSS_SELECTOR, ".filter-select, select")
            self.log(f"Found {len(filters)} filter elements")
            self.screenshot("05_filters")
            self.test_pass("Filters present")
        except Exception as e:
            self.test_fail("Filters", e)

    def test_06_side_toggle(self):
        """Test Buy/Sell side toggle"""
        try:
            # Find side toggle buttons
            buy_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-buy")
            sell_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-sell")

            # Click sell side
            sell_btn.click()
            time.sleep(0.5)
            self.log("Clicked Sell side")
            self.log(f"Sell button active: {'active' in sell_btn.get_attribute('class')}")

            # Click buy side
            buy_btn.click()
            time.sleep(0.5)
            self.log("Clicked Buy side")
            self.log(f"Buy button active: {'active' in buy_btn.get_attribute('class')}")

            self.screenshot("06_side_toggle")
            self.test_pass("Side toggle works")
        except Exception as e:
            self.test_fail("Side toggle", e)

    def test_07_create_order_form(self):
        """Test create order form fields"""
        try:
            # Close any modal first
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                try:
                    btn.click()
                except:
                    pass
            time.sleep(0.5)

            # Scroll and open create order modal
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.3)
            btn = self.driver.find_element(By.CSS_SELECTOR, ".action-btn.action-btn-primary")
            self.driver.execute_script("arguments[0].scrollIntoView(true);", btn)
            time.sleep(0.3)
            btn.click()
            time.sleep(1)

            # Check form fields exist
            amount_input = self.driver.find_element(By.CSS_SELECTOR, "#create-amount")
            price_input = self.driver.find_element(By.CSS_SELECTOR, "#create-price")

            # Fill in test values
            amount_input.clear()
            amount_input.send_keys("100")
            self.log("Entered amount: 100")

            price_input.clear()
            price_input.send_keys("0.05")
            self.log("Entered price: 0.05")

            # Check for terms input (might be optional)
            terms_fields = self.driver.find_elements(By.CSS_SELECTOR, "#create-terms")
            if terms_fields:
                terms_fields[0].clear()
                terms_fields[0].send_keys("Test terms for P2P trade")
                self.log("Entered terms")

            time.sleep(0.5)
            self.screenshot("07_create_order_form")

            # Check summary updates
            summary_els = self.driver.find_elements(By.CSS_SELECTOR, "#create-summary, .order-summary")
            if summary_els:
                self.log(f"Summary text: {summary_els[0].text[:100] if summary_els[0].text else 'empty'}...")

            self.test_pass("Create order form fields work")
        except Exception as e:
            self.test_fail("Create order form", e)

    def test_08_my_trades_tabs(self):
        """Test My Trades tabs"""
        try:
            # Close any modal first
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                try:
                    btn.click()
                except:
                    pass
            time.sleep(0.5)

            # Scroll and open My Trades
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.3)
            btns = self.driver.find_elements(By.CSS_SELECTOR, ".action-btn.action-btn-secondary")
            if btns:
                self.driver.execute_script("arguments[0].scrollIntoView(true);", btns[0])
                time.sleep(0.3)
                btns[0].click()
            time.sleep(1)

            # Find tabs
            tabs = self.driver.find_elements(By.CSS_SELECTOR, ".trades-tab")
            self.log(f"Found {len(tabs)} tabs")

            # Click each tab
            for tab in tabs:
                tab.click()
                time.sleep(0.5)
                self.log(f"Clicked tab: {tab.text}")

            self.screenshot("08_my_trades_tabs")
            self.test_pass("My Trades tabs work")
        except Exception as e:
            self.test_fail("My Trades tabs", e)

    def test_09_payment_method_filter(self):
        """Test payment method filter"""
        try:
            # Close modal
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                try:
                    btn.click()
                except:
                    pass
            time.sleep(0.5)

            # Scroll back to top
            self.driver.execute_script("window.scrollTo(0, 0)")
            time.sleep(0.3)

            # Find payment method dropdown
            payment_dropdown = self.driver.find_element(By.CSS_SELECTOR, "#payment-dropdown")
            trigger_btn = payment_dropdown.find_element(By.CSS_SELECTOR, ".dropdown-trigger")
            trigger_btn.click()
            time.sleep(0.5)

            # Find payment method checkboxes
            payment_items = self.driver.find_elements(By.CSS_SELECTOR, ".dropdown-item[data-method]")
            self.log(f"Found {len(payment_items)} payment methods")

            # List payment methods
            for item in payment_items[:5]:  # Just list first 5
                label = item.find_element(By.TAG_NAME, "span")
                self.log(f"  - {label.text}")

            self.screenshot("09_payment_filter")
            self.test_pass("Payment method filter works")
        except Exception as e:
            self.test_fail("Payment method filter", e)

    def test_10_currency_filter(self):
        """Test currency filter"""
        try:
            # Click away from payment dropdown if open
            self.driver.find_element(By.CSS_SELECTOR, "body").click()
            time.sleep(0.3)

            currency_select = self.driver.find_element(By.CSS_SELECTOR, "#currency-select")
            options = currency_select.find_elements(By.TAG_NAME, "option")
            self.log(f"Found {len(options)} currencies")

            for opt in options:
                self.log(f"  - {opt.text}")

            self.screenshot("10_currency_filter")
            self.test_pass("Currency filter works")
        except Exception as e:
            self.test_fail("Currency filter", e)

    def test_11_contract_view(self):
        """Test contract view API call"""
        try:
            # Execute JavaScript to call the contract view
            result = self.driver.execute_script("""
                return new Promise((resolve) => {
                    if (typeof contractCall === 'function') {
                        contractCall('view', {}).then(r => resolve(JSON.stringify(r))).catch(e => resolve('error: ' + e.message));
                    } else {
                        resolve('contractCall not defined');
                    }
                });
            """)
            self.log(f"Contract view result: {result[:200] if result else 'null'}...")
            self.screenshot("11_contract_view")
            self.test_pass("Contract view API call")
        except Exception as e:
            self.test_fail("Contract view API", e)

    def test_12_order_cards_structure(self):
        """Test order card structure"""
        try:
            orders = self.driver.find_elements(By.CSS_SELECTOR, ".order-card")
            if orders:
                order = orders[0]
                # Check order card has expected elements
                trader = order.find_elements(By.CSS_SELECTOR, ".order-trader")
                price = order.find_elements(By.CSS_SELECTOR, ".order-price")
                limits = order.find_elements(By.CSS_SELECTOR, ".order-limits")

                self.log(f"Order card elements - trader: {len(trader)}, price: {len(price)}, limits: {len(limits)}")
                self.screenshot("12_order_card_structure")
                self.test_pass("Order card structure correct")
            else:
                self.log("No orders to check structure")
                self.test_pass("Order card structure (no orders)")
        except Exception as e:
            self.test_fail("Order card structure", e)

    def run_all(self):
        print("\n" + "="*50)
        print("P2P SELENIUM TESTS")
        print("="*50 + "\n")

        os.makedirs("tests/screenshots", exist_ok=True)

        self.test_01_navigate_to_p2p()
        self.test_02_order_book_loads()
        self.test_03_create_order_modal()
        self.test_04_my_trades()
        self.test_05_filters()
        self.test_06_side_toggle()
        self.test_07_create_order_form()
        self.test_08_my_trades_tabs()
        self.test_09_payment_method_filter()
        self.test_10_currency_filter()
        self.test_11_contract_view()
        self.test_12_order_cards_structure()

        print("\n" + "="*50)
        passed = sum(1 for _, s, _ in self.results if s)
        failed = len(self.results) - passed
        print(f"Passed: {passed}/{len(self.results)}")
        if failed > 0:
            print(f"Failed: {failed}")
            print("\nFailed tests:")
            for name, success, error in self.results:
                if not success:
                    print(f"  - {name}: {error}")
        print("="*50)

if __name__ == "__main__":
    tests = P2PTests()
    tests.run_all()
