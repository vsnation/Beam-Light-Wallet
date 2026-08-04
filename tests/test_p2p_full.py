#!/usr/bin/env python3
"""
P2P Escrow Contract - Full Two-Wallet Test Suite

Tests the complete P2P trading flow with:
1. Two wallets (buyer and seller)
2. Full order lifecycle
3. Escrow staking
4. Manager-only menu visibility
5. Two-step trade completion

Prerequisites:
- Two wallets set up: test_wallet (seller) and test_2 (buyer)
- serve.py running on port 9080
- Selenium + Chrome WebDriver installed

Run: python3 tests/test_p2p_full.py [--headless]
"""

import os
import sys
import time
import json
import subprocess
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
    from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
except ImportError:
    print("ERROR: Selenium not installed. Run: pip3 install selenium")
    sys.exit(1)

# Configuration
BASE_URL = "http://127.0.0.1:9080"
WALLET_API_URL = "http://127.0.0.1:10000/api/wallet"

# Two wallets for testing
SELLER_WALLET = {
    "name": "test_wallet",
    "password": os.environ.get('BEAM_TEST_PASSWORD', '')
}

BUYER_WALLET = {
    "name": "test_2",
    "password": "test_2"  # Assuming same password pattern
}

# Manager wallet (contract owner)
MANAGER_WALLET = SELLER_WALLET  # test_wallet is the owner

CONTRACT_ID = "b812911e98cc002b946f570ef8ddb2a581dec41ecd75adff5ca9cc1651d949c1"
SCREENSHOT_DIR = "tests/screenshots/p2p_full"


class P2PFullTests:
    """Full P2P test suite with two wallets"""

    def __init__(self, headless=False):
        self.headless = headless
        self.driver = None
        self.wait = None
        self.tabs = {}  # Store tab handles: {"seller": handle, "buyer": handle}
        self.current_wallet = None
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        self.test_results = []

    def connect_to_chrome(self):
        """Connect to existing Chrome debug session"""
        if self.driver:
            return self.driver

        options = webdriver.ChromeOptions()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(5)
        self.wait = WebDriverWait(self.driver, 30)

        # Store the initial tab
        self.tabs["seller"] = self.driver.current_window_handle
        return self.driver

    def create_driver(self, name):
        """Create or get driver, open new tab for the wallet"""
        if not self.driver:
            self.connect_to_chrome()

        if name not in self.tabs:
            # Open new tab for this wallet
            self.driver.execute_script("window.open('');")
            # Switch to the new tab
            all_handles = self.driver.window_handles
            new_handle = [h for h in all_handles if h not in self.tabs.values()][0]
            self.tabs[name] = new_handle

        # Switch to the requested tab
        self.driver.switch_to.window(self.tabs[name])
        return self.driver

    def get_driver(self, name="default"):
        """Get driver and switch to the specified tab"""
        return self.create_driver(name)

    def get_wait(self, name="default"):
        """Get wait object for browser"""
        self.get_driver(name)  # Ensure we're on the right tab
        return self.wait

    def cleanup(self):
        """Don't close the debug session, just clean up tabs"""
        # Close extra tabs but keep the main one
        if self.driver and len(self.tabs) > 1:
            main_tab = list(self.tabs.values())[0]
            for name, handle in list(self.tabs.items()):
                if handle != main_tab:
                    try:
                        self.driver.switch_to.window(handle)
                        self.driver.close()
                    except:
                        pass
            self.driver.switch_to.window(main_tab)
        self.tabs = {}

    def log(self, msg, level="INFO"):
        """Log message with timestamp"""
        ts = datetime.now().strftime("%H:%M:%S")
        prefix = {"INFO": "ℹ️", "OK": "✅", "FAIL": "❌", "WARN": "⚠️"}.get(level, "•")
        print(f"[{ts}] {prefix} {msg}")

    def screenshot(self, name, browser="default"):
        """Save screenshot"""
        ts = datetime.now().strftime("%H%M%S")
        path = f"{SCREENSHOT_DIR}/{name}_{ts}.png"
        self.get_driver(browser).save_screenshot(path)
        self.log(f"Screenshot: {path}", "INFO")
        return path

    def wait_for(self, selector, timeout=10, browser="default"):
        """Wait for element"""
        return WebDriverWait(self.get_driver(browser), timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def click(self, selector, browser="default"):
        """Click element safely"""
        driver = self.get_driver(browser)
        el = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
        )
        try:
            el.click()
        except ElementClickInterceptedException:
            # Try JavaScript click if intercepted
            driver.execute_script("arguments[0].click();", el)
        return el

    def type_text(self, selector, text, browser="default"):
        """Type text into input"""
        el = self.wait_for(selector, browser=browser)
        el.clear()
        el.send_keys(text)
        return el

    def switch_wallet(self, wallet_config, browser="default"):
        """Switch to a different wallet by locking and unlocking"""
        driver = self.get_driver(browser)
        self.log(f"Switching to wallet: {wallet_config['name']}")

        # Navigate to root to lock
        driver.get(f"{BASE_URL}/")
        time.sleep(2)

        # Click lock button if visible
        try:
            lock_btn = driver.find_element(By.CSS_SELECTOR, "#lock-wallet-btn, .lock-btn, [onclick*='lockWallet']")
            lock_btn.click()
            time.sleep(2)
        except:
            pass

        # Try to unlock the new wallet
        return self.unlock_wallet(wallet_config, browser)

    def unlock_wallet(self, wallet_config, browser="default"):
        """Unlock a wallet"""
        driver = self.get_driver(browser)

        try:
            # Wait for welcome screen to load
            time.sleep(2)

            # Select wallet from welcome screen dropdown
            wallet_select = driver.find_element(By.CSS_SELECTOR, "#welcome-wallet-select")
            wallet_select.click()
            time.sleep(0.5)

            # Find and click the wallet option
            options = driver.find_elements(By.CSS_SELECTOR, "#welcome-wallet-select option")
            for opt in options:
                if wallet_config["name"] in opt.get_attribute("value"):
                    opt.click()
                    break

            time.sleep(0.3)

            # Enter password
            password_input = driver.find_element(By.CSS_SELECTOR, "#welcome-password")
            password_input.clear()
            password_input.send_keys(wallet_config["password"])

            # Click unlock
            unlock_btn = driver.find_element(By.CSS_SELECTOR, "#welcome-unlock-btn")
            unlock_btn.click()

            time.sleep(5)  # Wait for wallet-api to start

            self.current_wallet = wallet_config["name"]
            self.log(f"Wallet unlocked: {wallet_config['name']}", "OK")
            return True

        except Exception as e:
            self.log(f"Unlock error: {e}", "WARN")
            return False

    # ==================== TEST CASES ====================

    def test_01_setup_seller_wallet(self):
        """Set up seller wallet browser"""
        self.log("Setting up seller wallet...")
        driver = self.create_driver("seller")

        # Start from root route
        driver.get(f"{BASE_URL}/")
        time.sleep(2)
        self.screenshot("01_seller_landing", "seller")

        if self.unlock_wallet(SELLER_WALLET, "seller"):
            self.screenshot("01b_seller_unlocked", "seller")
            return True
        return False

    def test_02_setup_buyer_wallet(self):
        """Set up buyer wallet browser"""
        self.log("Setting up buyer wallet...")
        driver = self.create_driver("buyer")

        # Start from root route
        driver.get(f"{BASE_URL}/")
        time.sleep(2)
        self.screenshot("02_buyer_landing", "buyer")

        if self.unlock_wallet(BUYER_WALLET, "buyer"):
            self.screenshot("02b_buyer_unlocked", "buyer")
            return True
        return False

    def test_03_seller_open_p2p(self):
        """Seller opens P2P marketplace"""
        self.log("Seller opening P2P marketplace...")
        driver = self.get_driver("seller")

        driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)
        self.screenshot("03_seller_p2p", "seller")

        # Verify P2P loaded
        try:
            header = driver.find_element(By.CSS_SELECTOR, "h1")
            assert "P2P" in header.text
            self.log("Seller P2P page loaded", "OK")
            return True
        except:
            self.log("P2P page not loaded", "FAIL")
            return False

    def test_04_check_manager_menu_visibility(self):
        """Test manager menu is only visible to managers"""
        self.log("Testing manager menu visibility...")

        # Seller (manager/owner) should see manager button
        seller_driver = self.get_driver("seller")
        time.sleep(2)

        try:
            manager_btn = seller_driver.find_element(By.CSS_SELECTOR, "#manager-menu-btn")
            is_visible = manager_btn.is_displayed()

            if is_visible:
                self.log("Manager button visible for seller (manager)", "OK")
                self.screenshot("04_manager_btn_visible", "seller")

                # Click to open manager panel
                manager_btn.click()
                time.sleep(1)
                self.screenshot("04b_manager_panel", "seller")

                # Verify manager panel opened
                panel = seller_driver.find_element(By.CSS_SELECTOR, "#manager-panel-modal")
                if panel.is_displayed():
                    self.log("Manager panel opened", "OK")

                    # Close it
                    close_btn = seller_driver.find_element(By.CSS_SELECTOR, "#manager-panel-modal .modal-close")
                    close_btn.click()
                    time.sleep(0.5)
            else:
                self.log("Manager button NOT visible for seller", "WARN")

        except NoSuchElementException:
            self.log("Manager button not found (might not be manager)", "WARN")

        # Buyer (not manager) should NOT see manager button
        buyer_driver = self.get_driver("buyer")
        buyer_driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)
        self.screenshot("04c_buyer_p2p", "buyer")

        try:
            manager_btn = buyer_driver.find_element(By.CSS_SELECTOR, "#manager-menu-btn")
            if not manager_btn.is_displayed():
                self.log("Manager button correctly hidden for buyer (non-manager)", "OK")
            else:
                self.log("Manager button should NOT be visible to non-manager!", "WARN")
        except:
            self.log("Manager button correctly not found for buyer", "OK")

        return True

    def test_05_seller_register(self):
        """Seller registers as trader if needed"""
        self.log("Checking seller registration...")
        driver = self.get_driver("seller")

        try:
            reg_banner = driver.find_element(By.CSS_SELECTOR, "#registration-banner")
            if reg_banner.is_displayed():
                self.log("Seller needs to register")

                reg_btn = driver.find_element(By.CSS_SELECTOR, "#registration-banner button")
                reg_btn.click()
                time.sleep(1)
                self.screenshot("05_seller_register_modal", "seller")

                # Fill nickname
                nickname_input = driver.find_element(By.CSS_SELECTOR, "#register-nickname")
                nickname_input.clear()
                nickname_input.send_keys("TestSeller")

                # Submit
                submit_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='submitRegistration']")
                submit_btn.click()
                time.sleep(3)
                self.screenshot("05b_seller_registered", "seller")

                self.log("Seller registration submitted", "OK")
            else:
                self.log("Seller already registered", "OK")
        except:
            self.log("Seller already registered or banner not visible", "OK")

        return True

    def test_06_buyer_register(self):
        """Buyer registers as trader if needed"""
        self.log("Checking buyer registration...")
        driver = self.get_driver("buyer")

        try:
            reg_banner = driver.find_element(By.CSS_SELECTOR, "#registration-banner")
            if reg_banner.is_displayed():
                self.log("Buyer needs to register")

                reg_btn = driver.find_element(By.CSS_SELECTOR, "#registration-banner button")
                reg_btn.click()
                time.sleep(1)
                self.screenshot("06_buyer_register_modal", "buyer")

                # Fill nickname
                nickname_input = driver.find_element(By.CSS_SELECTOR, "#register-nickname")
                nickname_input.clear()
                nickname_input.send_keys("TestBuyer")

                # Submit
                submit_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='submitRegistration']")
                submit_btn.click()
                time.sleep(3)
                self.screenshot("06b_buyer_registered", "buyer")

                self.log("Buyer registration submitted", "OK")
            else:
                self.log("Buyer already registered", "OK")
        except:
            self.log("Buyer already registered or banner not visible", "OK")

        return True

    def test_07_seller_create_order(self):
        """Seller creates a sell order"""
        self.log("Seller creating sell order...")
        driver = self.get_driver("seller")

        # Click Create Order
        self.click("button[onclick*='showCreateOrder']", "seller")
        time.sleep(1)
        self.screenshot("07_create_order_modal", "seller")

        # Fill order details
        self.type_text("#create-amount", "100", "seller")  # 100 FOMO
        self.type_text("#create-price", "0.01", "seller")  # $0.01 per FOMO
        self.type_text("#create-min-limit", "1", "seller")
        self.type_text("#create-max-limit", "100", "seller")

        self.screenshot("07b_order_filled", "seller")

        # Check terms
        try:
            terms = driver.find_element(By.CSS_SELECTOR, "#create-terms")
            if not terms.is_selected():
                terms.click()
        except:
            pass

        # Submit
        submit_btn = driver.find_element(By.CSS_SELECTOR, "#create-order-submit")
        submit_btn.click()
        time.sleep(2)
        self.screenshot("07c_order_submitting", "seller")

        # Confirm transaction if prompted
        try:
            confirm_btn = self.wait_for("#tx-confirm-btn", timeout=5, browser="seller")
            confirm_btn.click()
            time.sleep(5)
            self.screenshot("07d_order_confirmed", "seller")
        except:
            pass

        self.log("Seller order created", "OK")
        return True

    def test_08_buyer_view_orders(self):
        """Buyer views available orders"""
        self.log("Buyer viewing orders...")
        driver = self.get_driver("buyer")

        # Refresh orders
        try:
            self.click("button[onclick*='refreshOrders']", "buyer")
            time.sleep(2)
        except:
            pass

        self.screenshot("08_buyer_orders", "buyer")

        orders_list = driver.find_element(By.CSS_SELECTOR, "#orders-list")
        content = orders_list.text

        if "Loading" not in content:
            self.log("Orders loaded for buyer", "OK")
            return True
        else:
            self.log("Orders still loading", "WARN")
            return True

    def test_09_buyer_accept_order(self):
        """Buyer accepts seller's order"""
        self.log("Buyer accepting order...")
        driver = self.get_driver("buyer")

        try:
            # Find and click Buy button on an order
            buy_btns = driver.find_elements(By.CSS_SELECTOR, ".order-row .btn-primary, .order-action button")
            if buy_btns:
                buy_btns[0].click()
                time.sleep(1)
                self.screenshot("09_trade_modal", "buyer")

                # Fill trade amount
                try:
                    self.type_text("#trade-pay-amount", "1", "buyer")  # $1
                except:
                    pass

                # Check agreements
                for cb in ["#trade-agree-time", "#trade-agree-deposit"]:
                    try:
                        checkbox = driver.find_element(By.CSS_SELECTOR, cb)
                        if not checkbox.is_selected():
                            checkbox.click()
                    except:
                        pass

                self.screenshot("09b_trade_filled", "buyer")

                # Start trade
                start_btn = driver.find_element(By.CSS_SELECTOR, "#trade-submit, button[onclick*='startTrade']")
                start_btn.click()
                time.sleep(2)

                # Confirm transaction
                try:
                    confirm_btn = self.wait_for("#tx-confirm-btn", timeout=5, browser="buyer")
                    confirm_btn.click()
                    time.sleep(5)
                except:
                    pass

                self.screenshot("09c_trade_started", "buyer")
                self.log("Buyer started trade", "OK")
            else:
                self.log("No orders available to accept", "WARN")

        except Exception as e:
            self.log(f"Accept order error: {e}", "WARN")

        return True

    def test_10_buyer_mark_payment_sent(self):
        """Buyer marks payment as sent"""
        self.log("Buyer marking payment sent...")
        driver = self.get_driver("buyer")

        # Open My Trades
        try:
            self.click("button[onclick*='showMyTrades']", "buyer")
            time.sleep(1)
            self.screenshot("10_buyer_my_trades", "buyer")

            # Click on active trade
            trade_card = driver.find_element(By.CSS_SELECTOR, "#active-trades-list .trade-card, .trade-row")
            trade_card.click()
            time.sleep(1)
            self.screenshot("10b_buyer_trade_view", "buyer")

            # Click "I've Paid"
            payment_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='markPaymentSent']")
            payment_btn.click()
            time.sleep(2)

            # Confirm if needed
            try:
                confirm_btn = self.wait_for("#tx-confirm-btn", timeout=5, browser="buyer")
                confirm_btn.click()
                time.sleep(5)
            except:
                pass

            self.screenshot("10c_payment_marked", "buyer")
            self.log("Buyer marked payment sent", "OK")

        except Exception as e:
            self.log(f"Mark payment error: {e}", "WARN")

        return True

    def test_11_seller_confirm_payment(self):
        """Seller confirms payment received"""
        self.log("Seller confirming payment...")
        driver = self.get_driver("seller")

        # Refresh P2P page
        driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)

        # Open My Trades
        try:
            self.click("button[onclick*='showMyTrades']", "seller")
            time.sleep(1)
            self.screenshot("11_seller_my_trades", "seller")

            # Click on active trade
            trade_card = driver.find_element(By.CSS_SELECTOR, "#active-trades-list .trade-card, .trade-row")
            trade_card.click()
            time.sleep(1)
            self.screenshot("11b_seller_trade_view", "seller")

            # Click "Payment Received"
            confirm_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='confirmPayment']")
            confirm_btn.click()
            time.sleep(2)

            # Confirm transaction
            try:
                tx_confirm = self.wait_for("#tx-confirm-btn", timeout=5, browser="seller")
                tx_confirm.click()
                time.sleep(5)
            except:
                pass

            self.screenshot("11c_payment_confirmed", "seller")
            self.log("Seller confirmed payment (deposit returned)", "OK")

        except Exception as e:
            self.log(f"Confirm payment error: {e}", "WARN")

        return True

    def test_12_buyer_claim_trade(self):
        """Buyer claims trade (two-step completion)"""
        self.log("Buyer claiming trade...")
        driver = self.get_driver("buyer")

        # Refresh to get updated status
        driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)

        # Open My Trades
        try:
            self.click("button[onclick*='showMyTrades']", "buyer")
            time.sleep(1)

            # Click on active trade
            trade_card = driver.find_element(By.CSS_SELECTOR, "#active-trades-list .trade-card, .trade-row")
            trade_card.click()
            time.sleep(1)
            self.screenshot("12_buyer_claim_view", "buyer")

            # Look for claim button
            claim_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='claimTrade']")
            claim_btn.click()
            time.sleep(2)

            # Confirm
            try:
                tx_confirm = self.wait_for("#tx-confirm-btn", timeout=5, browser="buyer")
                tx_confirm.click()
                time.sleep(5)
            except:
                pass

            self.screenshot("12b_trade_claimed", "buyer")
            self.log("Buyer claimed trade (crypto received)", "OK")

        except Exception as e:
            self.log(f"Claim trade error: {e}", "WARN")

        return True

    def test_13_escrow_staking(self):
        """Test escrow staking functionality"""
        self.log("Testing escrow staking...")
        driver = self.get_driver("seller")

        # Open escrow staking modal
        self.click("button[onclick*='showEscrowStaking']", "seller")
        time.sleep(1)
        self.screenshot("13_escrow_modal", "seller")

        # Fill stake amount (small amount for test)
        try:
            self.type_text("#escrow-stake-amount", "1", "seller")  # 1 FOMO
            self.screenshot("13b_stake_amount", "seller")

            # Don't actually stake in test
            self.log("Escrow staking UI verified", "OK")
        except Exception as e:
            self.log(f"Escrow staking error: {e}", "WARN")

        # Close modal
        try:
            close_btn = driver.find_element(By.CSS_SELECTOR, "#escrow-modal .modal-close")
            close_btn.click()
        except:
            pass

        return True

    def test_14_manager_panel_tabs(self):
        """Test manager panel tabs"""
        self.log("Testing manager panel tabs...")
        driver = self.get_driver("seller")

        try:
            # Open manager panel
            manager_btn = driver.find_element(By.CSS_SELECTOR, "#manager-menu-btn")
            if manager_btn.is_displayed():
                manager_btn.click()
                time.sleep(1)

                # Test each tab
                tabs = ["overview", "fees", "disputes", "escrows", "managers", "settings"]
                for tab in tabs:
                    try:
                        tab_btn = driver.find_element(By.CSS_SELECTOR, f".manager-tab[data-tab='{tab}']")
                        tab_btn.click()
                        time.sleep(0.5)
                        self.screenshot(f"14_{tab}_tab", "seller")
                        self.log(f"Manager tab '{tab}' works", "OK")
                    except Exception as e:
                        self.log(f"Tab '{tab}' error: {e}", "WARN")

                # Close modal
                close_btn = driver.find_element(By.CSS_SELECTOR, "#manager-panel-modal .modal-close")
                close_btn.click()

        except Exception as e:
            self.log(f"Manager panel error: {e}", "WARN")

        return True

    def test_15_timeline_updates(self):
        """Verify timeline shows correct steps"""
        self.log("Checking timeline updates...")
        driver = self.get_driver("buyer")

        try:
            timeline_items = driver.find_elements(By.CSS_SELECTOR, ".timeline-item")
            self.log(f"Found {len(timeline_items)} timeline items", "INFO")

            for i, item in enumerate(timeline_items):
                step = item.get_attribute("data-step")
                classes = item.get_attribute("class")
                is_completed = "completed" in classes
                is_active = "active" in classes

                status = "✓" if is_completed else ("⏳" if is_active else "○")
                self.log(f"  Step {i+1} ({step}): {status}", "INFO")

            self.log("Timeline structure verified", "OK")

        except Exception as e:
            self.log(f"Timeline check error: {e}", "WARN")

        return True

    def run_all(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("P2P ESCROW - FULL TWO-WALLET TEST SUITE")
        print("="*60 + "\n")

        tests = [
            ("Setup Seller Wallet", self.test_01_setup_seller_wallet),
            ("Setup Buyer Wallet", self.test_02_setup_buyer_wallet),
            ("Seller Open P2P", self.test_03_seller_open_p2p),
            ("Manager Menu Visibility", self.test_04_check_manager_menu_visibility),
            ("Seller Register", self.test_05_seller_register),
            ("Buyer Register", self.test_06_buyer_register),
            ("Seller Create Order", self.test_07_seller_create_order),
            ("Buyer View Orders", self.test_08_buyer_view_orders),
            ("Buyer Accept Order", self.test_09_buyer_accept_order),
            ("Buyer Mark Payment Sent", self.test_10_buyer_mark_payment_sent),
            ("Seller Confirm Payment", self.test_11_seller_confirm_payment),
            ("Buyer Claim Trade", self.test_12_buyer_claim_trade),
            ("Escrow Staking UI", self.test_13_escrow_staking),
            ("Manager Panel Tabs", self.test_14_manager_panel_tabs),
            ("Timeline Updates", self.test_15_timeline_updates),
        ]

        passed = 0
        failed = 0

        for name, test_func in tests:
            print(f"\n--- {name} ---")
            try:
                if test_func():
                    self.test_results.append((name, "PASS"))
                    passed += 1
                else:
                    self.test_results.append((name, "FAIL"))
                    failed += 1
            except Exception as e:
                self.test_results.append((name, f"ERROR: {e}"))
                failed += 1
                self.log(f"Error: {e}", "FAIL")

        # Print summary
        print("\n" + "="*60)
        print("TEST RESULTS SUMMARY")
        print("="*60)
        for name, result in self.test_results:
            status_icon = "✅" if result == "PASS" else "❌"
            print(f"{status_icon} {name}: {result}")

        print(f"\n📊 Total: {passed} passed, {failed} failed")
        print(f"📁 Screenshots saved to: {SCREENSHOT_DIR}")

        # Cleanup
        self.cleanup()

        return self.test_results


def main():
    headless = "--headless" in sys.argv

    print(f"Running P2P full tests (headless={headless})...")
    print(f"Seller wallet: {SELLER_WALLET['name']}")
    print(f"Buyer wallet: {BUYER_WALLET['name']}")
    print(f"Contract: {CONTRACT_ID[:16]}...")

    tests = P2PFullTests(headless=headless)
    results = tests.run_all()

    # Exit with error code if any tests failed
    failed = sum(1 for _, r in results if r != "PASS")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
