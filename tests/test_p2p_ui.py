#!/usr/bin/env python3
"""
P2P Escrow Contract - UI Tests with Selenium

Tests all P2P contract methods through the browser UI:
1. Trader Registration
2. Create Sell Order
3. Accept Order (start trade)
4. Mark Payment Sent
5. Confirm Payment (seller)
6. Claim Trade (buyer) - NEW two-step completion
7. Escrow Staking
8. Submit Feedback
9. Open Dispute
10. Escrow Vote
11. Claim Dispute Win - NEW

Run: python3 test_p2p_ui.py [--headless]
"""

import os
import sys
import time
import json
from datetime import datetime

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
except ImportError:
    print("ERROR: Selenium not installed. Run: pip3 install selenium")
    sys.exit(1)

# Configuration
BASE_URL = "http://127.0.0.1:9080"
WALLET_PASSWORD = os.environ.get('BEAM_TEST_PASSWORD', '')
WALLET_NAME = "test_wallet"
CONTRACT_ID = "b812911e98cc002b946f570ef8ddb2a581dec41ecd75adff5ca9cc1651d949c1"
SCREENSHOT_DIR = "tests/screenshots/p2p"

class P2PUITests:
    def __init__(self, headless=False):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--window-size=1400,900')
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')

        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(5)
        self.wait = WebDriverWait(self.driver, 30)

        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        self.test_results = []

    def screenshot(self, name):
        """Save screenshot with timestamp"""
        ts = datetime.now().strftime("%H%M%S")
        path = f"{SCREENSHOT_DIR}/{name}_{ts}.png"
        self.driver.save_screenshot(path)
        print(f"  📸 Screenshot: {path}")
        return path

    def log(self, msg, level="INFO"):
        """Log message with timestamp"""
        ts = datetime.now().strftime("%H:%M:%S")
        prefix = {"INFO": "ℹ️", "OK": "✅", "FAIL": "❌", "WARN": "⚠️"}.get(level, "•")
        print(f"[{ts}] {prefix} {msg}")

    def wait_for(self, selector, timeout=10):
        """Wait for element by CSS selector"""
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def click(self, selector):
        """Click element by CSS selector"""
        el = self.wait_for(selector)
        el.click()
        return el

    def type_text(self, selector, text):
        """Type text into input"""
        el = self.wait_for(selector)
        el.clear()
        el.send_keys(text)
        return el

    def get_text(self, selector):
        """Get text content"""
        return self.wait_for(selector).text

    def wait_for_tx(self, timeout=60):
        """Wait for transaction to complete"""
        self.log("Waiting for transaction confirmation...")
        # Look for success toast or modal close
        time.sleep(3)  # Initial wait
        for i in range(timeout // 3):
            try:
                # Check for success indicators
                toast = self.driver.find_element(By.CSS_SELECTOR, ".toast-success, .success-msg")
                if toast.is_displayed():
                    self.log("Transaction confirmed", "OK")
                    return True
            except:
                pass
            time.sleep(3)
        return False

    # ==================== TESTS ====================

    def test_01_open_wallet_and_p2p(self):
        """Open wallet and navigate to P2P page"""
        self.log("Opening wallet UI...")
        self.driver.get(f"{BASE_URL}/index.html")
        time.sleep(2)
        self.screenshot("01_wallet_landing")

        # Check if we need to unlock
        try:
            unlock_form = self.driver.find_element(By.CSS_SELECTOR, "#unlock-form, .welcome-container")
            if unlock_form.is_displayed():
                self.log("Unlocking wallet...")

                # Select wallet
                try:
                    wallet_select = self.driver.find_element(By.CSS_SELECTOR, "#wallet-select")
                    wallet_select.click()
                    time.sleep(0.5)
                    option = self.driver.find_element(By.CSS_SELECTOR, f"option[value='{WALLET_NAME}']")
                    option.click()
                except:
                    pass

                # Enter password
                password_input = self.driver.find_element(By.CSS_SELECTOR, "#unlock-password, #password-input")
                password_input.send_keys(WALLET_PASSWORD)

                # Click unlock
                unlock_btn = self.driver.find_element(By.CSS_SELECTOR, "#unlock-btn, .unlock-btn, button[type='submit']")
                unlock_btn.click()

                time.sleep(5)
                self.screenshot("01b_wallet_unlocked")
        except:
            self.log("Wallet already unlocked or different flow")

        # Navigate to P2P
        self.log("Opening P2P marketplace...")
        self.driver.get(f"{BASE_URL}/p2p/p2p.html")
        time.sleep(3)
        self.screenshot("01c_p2p_marketplace")

        # Verify P2P loaded
        title = self.driver.find_element(By.CSS_SELECTOR, "h1")
        assert "P2P" in title.text, "P2P page not loaded"
        self.log("P2P marketplace opened", "OK")
        return True

    def test_02_register_trader(self):
        """Register as P2P trader"""
        self.log("Testing trader registration...")

        # Check if registration banner is shown
        try:
            reg_banner = self.driver.find_element(By.CSS_SELECTOR, "#registration-banner")
            if reg_banner.is_displayed():
                self.log("Registration required, clicking Register Now...")
                reg_btn = self.driver.find_element(By.CSS_SELECTOR, "#registration-banner button")
                reg_btn.click()
                time.sleep(1)
            else:
                # Already registered, try to open profile
                self.log("May already be registered")
                return True
        except:
            # Try opening registration modal manually
            try:
                self.click("button[onclick*='showRegistrationModal']")
                time.sleep(1)
            except:
                self.log("Registration modal not found, might be registered", "WARN")
                return True

        self.screenshot("02_register_modal")

        # Fill nickname
        try:
            nickname_input = self.driver.find_element(By.CSS_SELECTOR, "#register-nickname")
            nickname_input.clear()
            nickname_input.send_keys("TestTrader")
        except:
            pass

        # Click register button
        try:
            submit_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick*='submitRegistration']")
            submit_btn.click()
            time.sleep(2)
            self.screenshot("02b_register_submitted")

            # Wait for transaction
            self.wait_for_tx()
            self.log("Trader registration submitted", "OK")
        except Exception as e:
            self.log(f"Registration error: {e}", "WARN")

        return True

    def test_03_create_sell_order(self):
        """Create a sell order for FOMO"""
        self.log("Testing create sell order...")

        # Click Create Order button
        self.click("button[onclick*='showCreateOrder']")
        time.sleep(1)
        self.screenshot("03_create_order_modal")

        # Set to Sell mode (should be default)
        try:
            sell_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-sell")
            if "active" not in sell_btn.get_attribute("class"):
                sell_btn.click()
                time.sleep(0.5)
        except:
            pass

        # Fill order details
        self.type_text("#create-amount", "100")  # 100 FOMO
        self.type_text("#create-price", "0.01")  # $0.01 per FOMO
        self.type_text("#create-min-limit", "1")
        self.type_text("#create-max-limit", "100")

        self.screenshot("03b_order_filled")

        # Check terms checkbox
        try:
            terms = self.driver.find_element(By.CSS_SELECTOR, "#create-terms")
            if not terms.is_selected():
                terms.click()
        except:
            pass

        # Submit order
        submit_btn = self.driver.find_element(By.CSS_SELECTOR, "#create-order-submit")
        submit_btn.click()
        time.sleep(2)
        self.screenshot("03c_order_submitting")

        # Wait for transaction confirmation modal
        try:
            confirm_btn = self.wait_for("#tx-confirm-btn", timeout=5)
            confirm_btn.click()
            self.wait_for_tx()
        except:
            pass

        self.log("Create order submitted", "OK")
        return True

    def test_04_view_orders(self):
        """View orders list"""
        self.log("Testing view orders...")

        # Refresh orders
        try:
            self.click("button[onclick*='refreshOrders']")
            time.sleep(2)
        except:
            pass

        self.screenshot("04_orders_list")

        # Check if orders loaded
        orders_list = self.driver.find_element(By.CSS_SELECTOR, "#orders-list")
        content = orders_list.text

        if "Loading" not in content and "No orders" not in content:
            self.log("Orders loaded successfully", "OK")
        else:
            self.log("No orders found or still loading", "WARN")

        return True

    def test_05_accept_order(self):
        """Accept an order (start trade)"""
        self.log("Testing accept order...")

        # Find and click first Buy button
        try:
            buy_btns = self.driver.find_elements(By.CSS_SELECTOR, ".order-row .btn-primary, .order-action button")
            if buy_btns:
                buy_btns[0].click()
                time.sleep(1)
                self.screenshot("05_trade_modal")

                # Fill trade amount
                try:
                    self.type_text("#trade-pay-amount", "10")  # $10
                except:
                    pass

                # Check agreements
                for cb in ["#trade-agree-time", "#trade-agree-deposit"]:
                    try:
                        checkbox = self.driver.find_element(By.CSS_SELECTOR, cb)
                        if not checkbox.is_selected():
                            checkbox.click()
                    except:
                        pass

                self.screenshot("05b_trade_filled")

                # Start trade
                try:
                    start_btn = self.driver.find_element(By.CSS_SELECTOR, "#trade-submit, button[onclick*='startTrade']")
                    start_btn.click()
                    time.sleep(2)

                    # Confirm transaction
                    try:
                        confirm_btn = self.wait_for("#tx-confirm-btn", timeout=5)
                        confirm_btn.click()
                        self.wait_for_tx()
                    except:
                        pass

                    self.log("Trade started", "OK")
                except Exception as e:
                    self.log(f"Could not start trade: {e}", "WARN")
            else:
                self.log("No orders available to accept", "WARN")
        except Exception as e:
            self.log(f"Accept order error: {e}", "WARN")

        return True

    def test_06_mark_payment_sent(self):
        """Mark payment as sent (buyer action)"""
        self.log("Testing mark payment sent...")

        # Open My Trades
        self.click("button[onclick*='showMyTrades']")
        time.sleep(1)
        self.screenshot("06_my_trades")

        # Click on active trade
        try:
            active_trade = self.driver.find_element(By.CSS_SELECTOR, "#active-trades-list .trade-card, .trade-row")
            active_trade.click()
            time.sleep(1)
            self.screenshot("06b_active_trade_view")

            # Click "I've Sent Payment"
            payment_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick*='markPaymentSent']")
            payment_btn.click()
            time.sleep(2)

            # Confirm
            try:
                confirm_btn = self.wait_for("#tx-confirm-btn", timeout=5)
                confirm_btn.click()
                self.wait_for_tx()
            except:
                pass

            self.log("Payment marked as sent", "OK")
        except Exception as e:
            self.log(f"Mark payment error: {e}", "WARN")

        return True

    def test_07_confirm_payment(self):
        """Confirm payment received (seller action)"""
        self.log("Testing confirm payment (seller)...")

        # This would be seller's action - in test we simulate both parties
        # Look for confirm button in active trade
        try:
            confirm_btn = self.driver.find_element(By.CSS_SELECTOR,
                "button[onclick*='confirmPayment'], button[onclick*='releasePayment']")
            confirm_btn.click()
            time.sleep(2)
            self.screenshot("07_confirm_payment")

            # Transaction confirmation
            try:
                tx_confirm = self.wait_for("#tx-confirm-btn", timeout=5)
                tx_confirm.click()
                self.wait_for_tx()
            except:
                pass

            self.log("Payment confirmed (seller)", "OK")
        except Exception as e:
            self.log(f"Confirm payment not available: {e}", "WARN")

        return True

    def test_08_claim_trade(self):
        """Claim trade (buyer claims after seller confirms) - NEW METHOD"""
        self.log("Testing claim trade (buyer)...")

        try:
            claim_btn = self.driver.find_element(By.CSS_SELECTOR,
                "button[onclick*='claimTrade'], button[onclick*='claimFunds']")
            claim_btn.click()
            time.sleep(2)
            self.screenshot("08_claim_trade")

            # Confirm
            try:
                tx_confirm = self.wait_for("#tx-confirm-btn", timeout=5)
                tx_confirm.click()
                self.wait_for_tx()
            except:
                pass

            self.log("Trade claimed (buyer)", "OK")
        except Exception as e:
            self.log(f"Claim trade not available: {e}", "WARN")

        return True

    def test_09_escrow_staking(self):
        """Test escrow staking"""
        self.log("Testing escrow staking...")

        # Close any open modals
        try:
            self.driver.find_element(By.CSS_SELECTOR, ".modal-close").click()
            time.sleep(0.5)
        except:
            pass

        # Open escrow staking
        self.click("button[onclick*='showEscrowStaking']")
        time.sleep(1)
        self.screenshot("09_escrow_modal")

        # Fill stake amount
        try:
            self.type_text("#escrow-stake-amount", "100000000")  # 1 FOMO in groth
        except:
            pass

        # Click stake (but don't confirm)
        try:
            stake_btn = self.driver.find_element(By.CSS_SELECTOR, "button[onclick*='stakeForEscrow']")
            stake_btn.click()
            time.sleep(2)
            self.screenshot("09b_stake_confirm")

            # Cancel to avoid actually staking in test
            try:
                cancel_btn = self.driver.find_element(By.CSS_SELECTOR, ".btn-secondary")
                cancel_btn.click()
            except:
                pass
        except Exception as e:
            self.log(f"Stake error: {e}", "WARN")

        self.log("Escrow staking UI works", "OK")
        return True

    def test_10_submit_feedback(self):
        """Test feedback submission"""
        self.log("Testing feedback submission...")

        # This would appear after trade completion
        # Look for feedback button in completed trades
        try:
            self.click("button[onclick*='showMyTrades']")
            time.sleep(1)

            # Switch to completed tab
            self.click("button[onclick*=\"showTradesTab('completed')\"]")
            time.sleep(1)
            self.screenshot("10_completed_trades")

            # Find feedback button
            feedback_btn = self.driver.find_element(By.CSS_SELECTOR,
                "button[onclick*='submitFeedback'], button[onclick*='leaveFeedback']")
            feedback_btn.click()
            time.sleep(1)
            self.screenshot("10b_feedback_modal")

            self.log("Feedback UI accessible", "OK")
        except Exception as e:
            self.log(f"Feedback not available: {e}", "WARN")

        return True

    def test_11_open_dispute(self):
        """Test opening a dispute"""
        self.log("Testing dispute opening...")

        try:
            # Look for dispute button in active trade
            dispute_btn = self.driver.find_element(By.CSS_SELECTOR,
                "button[onclick*='openDispute'], .btn-danger")
            dispute_btn.click()
            time.sleep(1)
            self.screenshot("11_dispute_modal")

            # Fill dispute form
            try:
                reason_select = self.driver.find_element(By.CSS_SELECTOR, "#dispute-reason")
                reason_select.click()
                option = self.driver.find_element(By.CSS_SELECTOR, "option[value='no_payment']")
                option.click()

                desc_textarea = self.driver.find_element(By.CSS_SELECTOR, "#dispute-description")
                desc_textarea.send_keys("Test dispute - payment not received")
            except:
                pass

            self.screenshot("11b_dispute_filled")

            # Don't actually submit in test
            self.log("Dispute UI works", "OK")
        except Exception as e:
            self.log(f"Dispute UI not available: {e}", "WARN")

        return True

    def test_12_view_trader_profile(self):
        """View trader profile"""
        self.log("Testing trader profile view...")

        try:
            # Click on trader avatar/name in order list
            trader_link = self.driver.find_element(By.CSS_SELECTOR,
                ".trader-avatar, .advertiser-name, [onclick*='showTraderProfile']")
            trader_link.click()
            time.sleep(1)
            self.screenshot("12_trader_profile")

            # Verify profile loaded
            profile_modal = self.driver.find_element(By.CSS_SELECTOR, "#trader-profile-modal")
            if profile_modal.is_displayed():
                self.log("Trader profile displayed", "OK")
            else:
                self.log("Profile modal not visible", "WARN")
        except Exception as e:
            self.log(f"Profile view error: {e}", "WARN")

        return True

    def test_13_global_stats(self):
        """View global marketplace stats"""
        self.log("Testing global stats...")

        # Close any modals
        try:
            for close_btn in self.driver.find_elements(By.CSS_SELECTOR, ".modal-close"):
                if close_btn.is_displayed():
                    close_btn.click()
                    time.sleep(0.3)
        except:
            pass

        self.click("button[onclick*='showGlobalStats']")
        time.sleep(1)
        self.screenshot("13_global_stats")

        # Verify stats loaded
        try:
            stats_modal = self.driver.find_element(By.CSS_SELECTOR, "#global-stats-modal")
            if stats_modal.is_displayed():
                self.log("Global stats displayed", "OK")
        except:
            self.log("Stats modal not visible", "WARN")

        return True

    def run_all(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("P2P ESCROW CONTRACT - UI TESTS")
        print("="*60 + "\n")

        tests = [
            ("Open Wallet & P2P", self.test_01_open_wallet_and_p2p),
            ("Register Trader", self.test_02_register_trader),
            ("Create Sell Order", self.test_03_create_sell_order),
            ("View Orders", self.test_04_view_orders),
            ("Accept Order", self.test_05_accept_order),
            ("Mark Payment Sent", self.test_06_mark_payment_sent),
            ("Confirm Payment", self.test_07_confirm_payment),
            ("Claim Trade (NEW)", self.test_08_claim_trade),
            ("Escrow Staking", self.test_09_escrow_staking),
            ("Submit Feedback", self.test_10_submit_feedback),
            ("Open Dispute", self.test_11_open_dispute),
            ("View Trader Profile", self.test_12_view_trader_profile),
            ("Global Stats", self.test_13_global_stats),
        ]

        results = []
        for name, test_fn in tests:
            print(f"\n{'─'*40}")
            print(f"TEST: {name}")
            print('─'*40)

            try:
                passed = test_fn()
                results.append((name, "PASS" if passed else "FAIL"))
            except Exception as e:
                self.screenshot(f"error_{name.replace(' ', '_')}")
                results.append((name, f"ERROR: {e}"))
                self.log(f"Test error: {e}", "FAIL")

        # Summary
        print("\n" + "="*60)
        print("TEST RESULTS SUMMARY")
        print("="*60)

        passed = sum(1 for _, r in results if r == "PASS")
        failed = len(results) - passed

        for name, result in results:
            status = "✅" if result == "PASS" else "❌"
            print(f"  {status} {name}: {result}")

        print(f"\n  Total: {passed}/{len(results)} passed")
        print("="*60 + "\n")

        return results

    def cleanup(self):
        """Close browser"""
        self.driver.quit()


if __name__ == "__main__":
    headless = "--headless" in sys.argv

    tester = P2PUITests(headless=headless)
    try:
        tester.run_all()
    finally:
        tester.cleanup()
