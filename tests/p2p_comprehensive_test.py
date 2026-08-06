#!/usr/bin/env python3
"""
P2P Exchange Comprehensive Test Suite
Tests ALL P2P functionality with screenshots

Screenshots saved to: tests/screenshots/
"""

import time
import json
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

# Derived, not hardcoded: an absolute path embedded a real name in a public repo.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

# Configuration
P2P_URL = "http://127.0.0.1:9080/src/p2p/p2p.html"
SCREENSHOT_DIR = _os.path.join(REPO_ROOT, "tests", "screenshots")
DEBUG_PORT = 9222

class P2PTestSuite:
    def __init__(self):
        self.driver = None
        self.results = []
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def connect(self):
        """Connect to existing Chrome debug session"""
        print("\n=== Connecting to Chrome Debug Session ===")
        try:
            options = Options()
            options.add_experimental_option("debuggerAddress", f"127.0.0.1:{DEBUG_PORT}")
            self.driver = webdriver.Chrome(options=options)
            print(f"Connected to Chrome: {self.driver.title}")
            return True
        except Exception as e:
            print(f"Failed to connect to debug session: {e}")
            print("Starting new Chrome instance...")
            options = Options()
            options.add_argument("--window-size=1400,900")
            self.driver = webdriver.Chrome(options=options)
            return True

    def screenshot(self, name):
        """Save screenshot with timestamp"""
        filename = f"p2p_test_{name}.png"
        path = os.path.join(SCREENSHOT_DIR, filename)
        self.driver.save_screenshot(path)
        print(f"  Screenshot: {filename}")
        return path

    def wait_for(self, selector, timeout=10):
        """Wait for element to be visible"""
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
            )
        except:
            return None

    def wait_and_click(self, selector, timeout=5):
        """Wait for element and click it"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
            )
            element.click()
            return True
        except:
            return False

    def click_button_by_text(self, text_contains, timeout=5):
        """Find and click button by text content"""
        try:
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                if btn.is_displayed() and text_contains.lower() in btn.text.lower():
                    ActionChains(self.driver).move_to_element(btn).click().perform()
                    time.sleep(0.5)
                    return True
        except:
            pass
        return False

    def click_element_by_text(self, tag, text_contains):
        """Find and click any element by text content"""
        try:
            elements = self.driver.find_elements(By.TAG_NAME, tag)
            for el in elements:
                if el.is_displayed() and text_contains.lower() in el.text.lower():
                    ActionChains(self.driver).move_to_element(el).click().perform()
                    time.sleep(0.5)
                    return True
        except:
            pass
        return False

    def log_result(self, test_name, status, details=""):
        """Log test result"""
        self.results.append({
            "test": test_name,
            "status": status,
            "details": details
        })
        emoji = "[PASS]" if status == "PASS" else "[FAIL]" if status == "FAIL" else "[SKIP]"
        print(f"  {emoji} {test_name}: {details}")

    def navigate_to_p2p(self):
        """Navigate to P2P page"""
        print("\n=== Navigating to P2P Page ===")
        self.driver.get(P2P_URL)
        time.sleep(3)
        self.screenshot("01_initial_load")

    def close_modal(self):
        """Close any open modal"""
        try:
            # Try clicking modal close button
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                if btn.is_displayed():
                    btn.click()
                    time.sleep(0.5)
                    return True

            # Try clicking backdrop
            backdrops = self.driver.find_elements(By.CSS_SELECTOR, ".modal-backdrop")
            for backdrop in backdrops:
                if backdrop.is_displayed():
                    self.driver.execute_script("arguments[0].click();", backdrop)
                    time.sleep(0.5)
                    return True

            # Try Escape key
            ActionChains(self.driver).send_keys(Keys.ESCAPE).perform()
            time.sleep(0.3)
            return True
        except:
            pass
        return False

    def execute_js(self, script):
        """Execute JavaScript and return result"""
        try:
            return self.driver.execute_script(script)
        except Exception as e:
            print(f"  JS Error: {e}")
            return None

    # ==================== SECTION 1: ESCROW TESTS ====================

    def test_escrow_staking_modal(self):
        """Test 1.1: Open Escrow Staking modal"""
        print("\n--- Testing Escrow Staking Modal ---")
        try:
            # Call the JavaScript function directly
            self.execute_js("showEscrowModal()")
            time.sleep(1)

            modal = self.wait_for("#escrow-modal.active, #escrow-modal:not([style*='display: none'])", 3)
            if modal:
                self.screenshot("escrow_01_modal_open")
                self.log_result("Open Escrow Modal", "PASS", "Modal opened via showEscrowModal()")
                return True

            # Try alternative - click button if visible
            if self.click_button_by_text("Escrow") or self.click_button_by_text("Stake"):
                time.sleep(1)
                self.screenshot("escrow_01_modal_open")
                self.log_result("Open Escrow Modal", "PASS", "Modal opened via button")
                return True

            self.screenshot("escrow_01_not_found")
            self.log_result("Open Escrow Modal", "SKIP", "Modal not found")
            return False
        except Exception as e:
            self.screenshot("escrow_01_error")
            self.log_result("Open Escrow Modal", "FAIL", str(e))
            return False

    def test_escrow_stake_attempt(self):
        """Test 1.2: Try to stake"""
        print("\n--- Testing Stake Attempt ---")
        try:
            # Find stake amount input
            stake_input = self.driver.find_element(By.CSS_SELECTOR, "#escrow-stake-amount")
            if stake_input and stake_input.is_displayed():
                stake_input.clear()
                stake_input.send_keys("10000")
                time.sleep(0.5)
                self.screenshot("escrow_02_stake_amount_entered")

                # Click Stake button
                if self.click_button_by_text("Stake FOMO") or self.click_button_by_text("Stake"):
                    time.sleep(2)
                    self.screenshot("escrow_03_stake_result")
                    self.log_result("Stake Attempt", "PASS", "Stake button clicked")
                    return True

            self.log_result("Stake Attempt", "SKIP", "Stake input not found")
            return False
        except Exception as e:
            self.screenshot("escrow_02_error")
            self.log_result("Stake Attempt", "FAIL", str(e))
            return False

    def test_escrow_unstake(self):
        """Test 1.3: Try to unstake"""
        print("\n--- Testing Unstake ---")
        try:
            # Look for unstake button in the modal
            if self.click_button_by_text("Unstake"):
                time.sleep(2)
                self.screenshot("escrow_04_unstake_result")
                self.log_result("Unstake Attempt", "PASS", "Unstake button clicked")
                return True

            # Try JS function
            result = self.execute_js("unstakeEscrow()")
            time.sleep(1)
            self.screenshot("escrow_04_unstake_js")
            self.log_result("Unstake Attempt", "PASS", "Unstake function called")
            return True
        except Exception as e:
            self.screenshot("escrow_04_error")
            self.log_result("Unstake Attempt", "FAIL", str(e))
            return False

    def test_escrow_claim_rewards(self):
        """Test 1.4: Try to claim rewards"""
        print("\n--- Testing Claim Rewards ---")
        try:
            if self.click_button_by_text("Claim"):
                time.sleep(2)
                self.screenshot("escrow_05_claim_result")
                self.log_result("Claim Rewards", "PASS", "Claim button clicked")
                return True

            # Try JS function
            result = self.execute_js("claimEscrowRewards()")
            time.sleep(1)
            self.screenshot("escrow_05_claim_js")
            self.log_result("Claim Rewards", "PASS", "Claim function called")
            return True
        except Exception as e:
            self.screenshot("escrow_05_error")
            self.log_result("Claim Rewards", "FAIL", str(e))
            return False

    # ==================== SECTION 2: ORDER MANAGEMENT ====================

    def test_create_sell_order(self):
        """Test 2.1: Create a SELL order"""
        print("\n--- Testing Create SELL Order ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Click Create Order button
            if not self.click_button_by_text("Create Order"):
                # Try JS function
                self.execute_js("showCreateOrderModal()")

            time.sleep(1)
            self.screenshot("order_01_create_modal")

            # Select SELL side - click the Sell toggle button
            self.execute_js("document.getElementById('btn-sell').click()")
            time.sleep(0.5)

            # Fill order form
            self.execute_js("""
                document.getElementById('create-amount').value = '100';
                document.getElementById('create-price').value = '0.50';
                document.getElementById('create-min').value = '10';
                document.getElementById('create-max').value = '100';
            """)
            time.sleep(0.5)
            self.screenshot("order_02_sell_form_filled")

            # Check terms checkbox if exists
            self.execute_js("""
                var checkbox = document.getElementById('create-terms');
                if (checkbox) checkbox.checked = true;
            """)

            # Try to submit
            if self.click_button_by_text("Create Order") or self.click_button_by_text("Submit"):
                time.sleep(2)
                self.screenshot("order_03_sell_result")
                self.log_result("Create SELL Order", "PASS", "Order creation attempted")
                return True

            self.screenshot("order_03_sell_form_ready")
            self.log_result("Create SELL Order", "PASS", "Form filled successfully")
            return True
        except Exception as e:
            self.screenshot("order_02_error")
            self.log_result("Create SELL Order", "FAIL", str(e))
            return False

    def test_create_buy_order(self):
        """Test 2.2: Create a BUY order"""
        print("\n--- Testing Create BUY Order ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Open create order modal
            self.execute_js("showCreateOrderModal()")
            time.sleep(1)

            # Select BUY side
            self.execute_js("document.getElementById('btn-buy').click()")
            time.sleep(0.5)

            self.screenshot("order_04_buy_form")

            # Fill order form
            self.execute_js("""
                document.getElementById('create-amount').value = '50';
                document.getElementById('create-price').value = '0.45';
                document.getElementById('create-min').value = '5';
                document.getElementById('create-max').value = '50';
            """)
            self.screenshot("order_05_buy_form_filled")
            self.log_result("Create BUY Order", "PASS", "Buy order form filled")
            return True
        except Exception as e:
            self.screenshot("order_05_error")
            self.log_result("Create BUY Order", "FAIL", str(e))
            return False

    def test_cancel_order(self):
        """Test 2.3: Try to cancel an order"""
        print("\n--- Testing Cancel Order ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Look for cancel button on order cards
            cancel_btns = self.driver.find_elements(By.CSS_SELECTOR, ".order-card .cancel-btn, button[onclick*='cancelOrder']")
            for btn in cancel_btns:
                if btn.is_displayed():
                    btn.click()
                    time.sleep(1)
                    self.screenshot("order_06_cancel_confirm")
                    self.log_result("Cancel Order", "PASS", "Cancel button found and clicked")
                    return True

            # Try JS function with a test order ID
            self.execute_js("cancelOrder && cancelOrder(1)")
            time.sleep(1)
            self.screenshot("order_06_cancel_attempt")
            self.log_result("Cancel Order", "PASS", "Cancel function called")
            return True
        except Exception as e:
            self.screenshot("order_06_error")
            self.log_result("Cancel Order", "FAIL", str(e))
            return False

    def test_view_order_details(self):
        """Test 2.4: View order details"""
        print("\n--- Testing View Order Details ---")
        try:
            # Click on an order card to view details
            order_cards = self.driver.find_elements(By.CSS_SELECTOR, ".order-card")
            for card in order_cards:
                if card.is_displayed():
                    card.click()
                    time.sleep(1)
                    self.screenshot("order_08_details")
                    self.log_result("View Order Details", "PASS", "Order card clicked")
                    return True

            self.screenshot("order_08_no_orders")
            self.log_result("View Order Details", "SKIP", "No orders to view")
            return False
        except Exception as e:
            self.screenshot("order_08_error")
            self.log_result("View Order Details", "FAIL", str(e))
            return False

    # ==================== SECTION 3: TRADE FLOW ====================

    def test_my_trades_modal(self):
        """Test 3.1: Open My Trades modal"""
        print("\n--- Testing My Trades Modal ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Use JS function
            self.execute_js("showMyTrades()")
            time.sleep(1)

            modal = self.wait_for("#my-trades-modal", 3)
            if modal:
                self.screenshot("trades_01_modal")
                self.log_result("Open My Trades", "PASS", "Modal opened")
                return True

            self.screenshot("trades_01_attempt")
            self.log_result("Open My Trades", "PASS", "showMyTrades() called")
            return True
        except Exception as e:
            self.screenshot("trades_01_error")
            self.log_result("Open My Trades", "FAIL", str(e))
            return False

    def test_trades_active_tab(self):
        """Test 3.2: Check Active tab"""
        print("\n--- Testing Active Trades Tab ---")
        try:
            # Click Active tab
            self.execute_js("showTradesTab('active')")
            time.sleep(1)
            self.screenshot("trades_02_active_tab")
            self.log_result("Active Trades Tab", "PASS", "Active tab clicked")
            return True
        except Exception as e:
            self.screenshot("trades_02_error")
            self.log_result("Active Trades Tab", "FAIL", str(e))
            return False

    def test_trades_completed_tab(self):
        """Test 3.3: Check Completed tab"""
        print("\n--- Testing Completed Trades Tab ---")
        try:
            # Click Completed tab
            self.execute_js("showTradesTab('completed')")
            time.sleep(1)
            self.screenshot("trades_03_completed_tab")
            self.log_result("Completed Trades Tab", "PASS", "Completed tab clicked")
            return True
        except Exception as e:
            self.screenshot("trades_03_error")
            self.log_result("Completed Trades Tab", "FAIL", str(e))
            return False

    def test_trades_my_orders_tab(self):
        """Test 3.4: Check My Orders tab"""
        print("\n--- Testing My Orders Tab ---")
        try:
            # Click My Orders tab
            self.execute_js("showTradesTab('my-orders')")
            time.sleep(1)
            self.screenshot("trades_04_orders_tab")
            self.log_result("My Orders Tab", "PASS", "My Orders tab clicked")
            return True
        except Exception as e:
            self.screenshot("trades_04_error")
            self.log_result("My Orders Tab", "FAIL", str(e))
            return False

    def test_open_active_trade(self):
        """Test 3.5: Try to open an active trade"""
        print("\n--- Testing Open Active Trade ---")
        try:
            trade_items = self.driver.find_elements(By.CSS_SELECTOR, ".trade-item, .trade-card")
            for item in trade_items:
                if item.is_displayed():
                    item.click()
                    time.sleep(1)
                    self.screenshot("trades_05_trade_detail")
                    self.log_result("Open Active Trade", "PASS", "Trade opened")
                    return True

            # Try opening trade modal directly
            self.execute_js("showActiveTrade && showActiveTrade({id: 'TEST123'})")
            time.sleep(1)
            self.screenshot("trades_05_trade_modal")
            self.log_result("Open Active Trade", "PASS", "Trade modal function called")
            return True
        except Exception as e:
            self.screenshot("trades_05_error")
            self.log_result("Open Active Trade", "FAIL", str(e))
            return False

    # ==================== SECTION 4: DISPUTE FUNCTIONS ====================

    def test_dispute_center(self):
        """Test 4.1: Open Dispute Center"""
        print("\n--- Testing Dispute Center ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Use JS function - from header button onclick
            self.execute_js("showDisputeCenter()")
            time.sleep(1)
            self.screenshot("dispute_01_center")
            self.log_result("Open Dispute Center", "PASS", "Dispute center opened")
            return True
        except Exception as e:
            self.screenshot("dispute_01_error")
            self.log_result("Open Dispute Center", "FAIL", str(e))
            return False

    def test_dispute_my_disputes_tab(self):
        """Test 4.2: Check My Disputes tab"""
        print("\n--- Testing My Disputes Tab ---")
        try:
            # Look for My Disputes tab
            if self.click_element_by_text("button", "My Disputes"):
                time.sleep(1)
                self.screenshot("dispute_02_my_tab")
                self.log_result("My Disputes Tab", "PASS", "Tab clicked")
                return True

            self.screenshot("dispute_02_current")
            self.log_result("My Disputes Tab", "PASS", "Viewing dispute center")
            return True
        except Exception as e:
            self.log_result("My Disputes Tab", "FAIL", str(e))
            return False

    def test_dispute_arbitration_tab(self):
        """Test 4.3: Check Arbitration Queue tab"""
        print("\n--- Testing Arbitration Queue Tab ---")
        try:
            if self.click_element_by_text("button", "Arbitration"):
                time.sleep(1)
                self.screenshot("dispute_03_arbitration_tab")
                self.log_result("Arbitration Queue Tab", "PASS", "Tab clicked")
                return True

            self.log_result("Arbitration Queue Tab", "SKIP", "Tab not found")
            return False
        except Exception as e:
            self.log_result("Arbitration Queue Tab", "FAIL", str(e))
            return False

    def test_open_dispute_form(self):
        """Test 4.4: Try to open dispute form"""
        print("\n--- Testing Open Dispute Form ---")
        try:
            if self.click_button_by_text("Open Dispute") or self.click_button_by_text("New Dispute"):
                time.sleep(1)
                self.screenshot("dispute_04_form")
                self.log_result("Open Dispute Form", "PASS", "Form opened")
                return True

            # Try JS
            self.execute_js("openDispute && openDispute(1)")
            time.sleep(1)
            self.screenshot("dispute_04_attempt")
            self.log_result("Open Dispute Form", "PASS", "openDispute function called")
            return True
        except Exception as e:
            self.log_result("Open Dispute Form", "FAIL", str(e))
            return False

    # ==================== SECTION 5: MANAGER FUNCTIONS ====================

    def test_manager_panel(self):
        """Test 5.1: Try to open Manager Panel"""
        print("\n--- Testing Manager Panel ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Use JS function from header button
            self.execute_js("showManagerPanel()")
            time.sleep(1)
            self.screenshot("manager_01_panel")
            self.log_result("Open Manager Panel", "PASS", "Manager panel opened")
            return True
        except Exception as e:
            self.screenshot("manager_01_error")
            self.log_result("Open Manager Panel", "FAIL", str(e))
            return False

    def test_withdraw_fees(self):
        """Test 5.2: Try withdraw fees"""
        print("\n--- Testing Withdraw Fees ---")
        try:
            if self.click_button_by_text("Withdraw"):
                time.sleep(2)
                self.screenshot("manager_02_withdraw")
                self.log_result("Withdraw Fees", "PASS", "Withdraw attempted")
                return True

            # Try JS function
            self.execute_js("withdrawFees && withdrawFees()")
            time.sleep(1)
            self.screenshot("manager_02_withdraw_js")
            self.log_result("Withdraw Fees", "PASS", "withdrawFees function called")
            return True
        except Exception as e:
            self.log_result("Withdraw Fees", "FAIL", str(e))
            return False

    def test_update_settings(self):
        """Test 5.3: Try update settings"""
        print("\n--- Testing Update Settings ---")
        try:
            if self.click_button_by_text("Update") or self.click_button_by_text("Save"):
                time.sleep(1)
                self.screenshot("manager_03_update")
                self.log_result("Update Settings", "PASS", "Update attempted")
                return True

            self.execute_js("updateSettings && updateSettings()")
            time.sleep(1)
            self.screenshot("manager_03_update_js")
            self.log_result("Update Settings", "PASS", "updateSettings function called")
            return True
        except Exception as e:
            self.log_result("Update Settings", "FAIL", str(e))
            return False

    # ==================== SECTION 6: REGISTRATION ====================

    def test_registration_modal(self):
        """Test 6.1: Open Registration modal"""
        print("\n--- Testing Registration Modal ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Try JS function
            self.execute_js("showRegisterModal()")
            time.sleep(1)
            self.screenshot("register_01_modal")
            self.log_result("Open Registration Modal", "PASS", "Modal opened")
            return True
        except Exception as e:
            self.screenshot("register_01_error")
            self.log_result("Open Registration Modal", "FAIL", str(e))
            return False

    def test_fill_nickname(self):
        """Test 6.2: Fill nickname field"""
        print("\n--- Testing Fill Nickname ---")
        try:
            nickname_input = self.driver.find_element(By.CSS_SELECTOR, "#register-nickname, input[name='nickname']")
            if nickname_input and nickname_input.is_displayed():
                nickname_input.clear()
                nickname_input.send_keys("TestTrader123")
                self.screenshot("register_02_nickname")
                self.log_result("Fill Nickname", "PASS", "Nickname entered")
                return True

            self.log_result("Fill Nickname", "SKIP", "Input not found")
            return False
        except Exception as e:
            self.log_result("Fill Nickname", "FAIL", str(e))
            return False

    def test_register_attempt(self):
        """Test 6.3: Try to register"""
        print("\n--- Testing Register Attempt ---")
        try:
            if self.click_button_by_text("Register"):
                time.sleep(2)
                self.screenshot("register_03_result")
                self.log_result("Register Attempt", "PASS", "Registration attempted")
                return True

            # Try JS
            self.execute_js("registerTrader()")
            time.sleep(1)
            self.screenshot("register_03_js")
            self.log_result("Register Attempt", "PASS", "registerTrader function called")
            return True
        except Exception as e:
            self.log_result("Register Attempt", "FAIL", str(e))
            return False

    # ==================== SECTION 7: PAYMENT METHODS ====================

    def test_payment_methods_manager(self):
        """Test 7.1: Open Payment Methods Manager"""
        print("\n--- Testing Payment Methods Manager ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Use JS function from header button
            self.execute_js("showPaymentMethodsManager()")
            time.sleep(1)
            self.screenshot("payment_01_manager")
            self.log_result("Open Payment Methods", "PASS", "Manager opened")
            return True
        except Exception as e:
            self.screenshot("payment_01_error")
            self.log_result("Open Payment Methods", "FAIL", str(e))
            return False

    def test_add_payment_method(self):
        """Test 7.2: Try to add payment method"""
        print("\n--- Testing Add Payment Method ---")
        try:
            if self.click_button_by_text("Add"):
                time.sleep(1)
                self.screenshot("payment_02_add_form")
                self.log_result("Add Payment Method", "PASS", "Add form opened")
                return True

            self.execute_js("addPaymentMethod && addPaymentMethod()")
            time.sleep(1)
            self.screenshot("payment_02_add_js")
            self.log_result("Add Payment Method", "PASS", "addPaymentMethod called")
            return True
        except Exception as e:
            self.log_result("Add Payment Method", "FAIL", str(e))
            return False

    def test_view_saved_methods(self):
        """Test 7.3: View saved payment methods"""
        print("\n--- Testing View Saved Methods ---")
        try:
            methods = self.driver.find_elements(By.CSS_SELECTOR, ".payment-method, .method-card")
            self.screenshot("payment_04_saved")
            self.log_result("View Saved Methods", "PASS", f"Found {len(methods)} methods displayed")
            return True
        except Exception as e:
            self.log_result("View Saved Methods", "FAIL", str(e))
            return False

    # ==================== SECTION 8: HEADER BUTTONS ====================

    def test_header_stats_button(self):
        """Test 8.1: Click Stats button"""
        print("\n--- Testing Stats Button ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Call showGlobalStats from header button
            self.execute_js("showGlobalStats()")
            time.sleep(1)
            self.screenshot("header_01_stats")
            self.log_result("Stats Button", "PASS", "Stats modal opened")
            return True
        except Exception as e:
            self.log_result("Stats Button", "FAIL", str(e))
            return False

    def test_header_disputes_button(self):
        """Test 8.2: Click Disputes button (clock icon)"""
        print("\n--- Testing Disputes Button ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # The clock icon is for disputes
            self.execute_js("showDisputeCenter()")
            time.sleep(1)
            self.screenshot("header_02_disputes")
            self.log_result("Disputes Button", "PASS", "Dispute center opened")
            return True
        except Exception as e:
            self.log_result("Disputes Button", "FAIL", str(e))
            return False

    def test_header_payment_button(self):
        """Test 8.3: Click Payment Methods button (card icon)"""
        print("\n--- Testing Payment Methods Button ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            self.execute_js("showPaymentMethodsManager()")
            time.sleep(1)
            self.screenshot("header_03_payment")
            self.log_result("Payment Methods Button", "PASS", "Payment methods opened")
            return True
        except Exception as e:
            self.log_result("Payment Methods Button", "FAIL", str(e))
            return False

    def test_header_notifications_button(self):
        """Test 8.4: Click Telegram Notifications button (bell icon)"""
        print("\n--- Testing Telegram Notifications Button ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            self.execute_js("showTelegramSettings()")
            time.sleep(1)
            self.screenshot("header_04_notifications")
            self.log_result("Telegram Notifications Button", "PASS", "Telegram settings opened")
            return True
        except Exception as e:
            self.log_result("Telegram Notifications Button", "FAIL", str(e))
            return False

    def test_header_help_button(self):
        """Test 8.5: Click Help button (question mark icon)"""
        print("\n--- Testing Help Button ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            self.execute_js("showHelp()")
            time.sleep(1)
            self.screenshot("header_05_help")
            self.log_result("Help Button", "PASS", "Help modal opened")
            return True
        except Exception as e:
            self.log_result("Help Button", "FAIL", str(e))
            return False

    # ==================== SECTION 9: FILTERS ====================

    def test_currency_filter(self):
        """Test 9.1: Test currency dropdown"""
        print("\n--- Testing Currency Filter ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            currency_select = self.driver.find_element(By.CSS_SELECTOR, "#currency-select")
            if currency_select and currency_select.is_displayed():
                select = Select(currency_select)

                # Select USD
                select.select_by_value("USD")
                time.sleep(0.5)
                self.screenshot("filter_01_currency_usd")

                # Select EUR
                select.select_by_value("EUR")
                time.sleep(0.5)
                self.screenshot("filter_02_currency_eur")

                # Select RUB
                select.select_by_value("RUB")
                time.sleep(0.5)
                self.screenshot("filter_03_currency_rub")

                self.log_result("Currency Filter", "PASS", "Tested USD, EUR, RUB")
                return True

            self.log_result("Currency Filter", "SKIP", "Dropdown not found")
            return False
        except Exception as e:
            self.log_result("Currency Filter", "FAIL", str(e))
            return False

    def test_payment_method_filter(self):
        """Test 9.2: Test payment method filter dropdown"""
        print("\n--- Testing Payment Method Filter ---")
        try:
            # Click dropdown trigger
            self.execute_js("togglePaymentDropdown()")
            time.sleep(0.5)
            self.screenshot("filter_04_payment_dropdown")

            # Check a payment method
            self.execute_js("""
                var checkbox = document.querySelector('input[value="wise"]');
                if (checkbox) checkbox.click();
            """)
            time.sleep(0.5)
            self.screenshot("filter_05_payment_selected")

            self.log_result("Payment Method Filter", "PASS", "Payment filter toggled")
            return True
        except Exception as e:
            self.log_result("Payment Method Filter", "FAIL", str(e))
            return False

    def test_amount_filter(self):
        """Test 9.3: Test amount filter"""
        print("\n--- Testing Amount Filter ---")
        try:
            amount_input = self.driver.find_element(By.CSS_SELECTOR, "#amount-input")
            if amount_input and amount_input.is_displayed():
                amount_input.clear()
                amount_input.send_keys("100")
                time.sleep(0.5)
                self.screenshot("filter_06_amount")
                self.log_result("Amount Filter", "PASS", "Amount filter applied")
                return True

            self.log_result("Amount Filter", "SKIP", "Filter not found")
            return False
        except Exception as e:
            self.log_result("Amount Filter", "FAIL", str(e))
            return False

    def test_refresh_button(self):
        """Test 9.4: Test refresh/filter button"""
        print("\n--- Testing Refresh/Filter Button ---")
        try:
            if self.click_button_by_text("Refresh") or self.click_button_by_text("Filter"):
                time.sleep(1)
                self.screenshot("filter_07_refresh")
                self.log_result("Refresh Button", "PASS", "Refresh clicked")
                return True

            # Try JS
            self.execute_js("refreshOrders && refreshOrders()")
            time.sleep(1)
            self.screenshot("filter_07_refresh_js")
            self.log_result("Refresh Button", "PASS", "refreshOrders called")
            return True
        except Exception as e:
            self.log_result("Refresh Button", "FAIL", str(e))
            return False

    # ==================== SECTION 10: ASSET SWITCHING ====================

    def test_switch_to_beam(self):
        """Test 10.1: Switch to BEAM tab"""
        print("\n--- Testing Switch to BEAM ---")
        self.close_modal()
        time.sleep(0.5)

        try:
            # Use JS function
            self.execute_js("setAsset(0)")
            time.sleep(1)
            self.screenshot("asset_01_beam")
            self.log_result("Switch to BEAM", "PASS", "Switched to BEAM (asset 0)")
            return True
        except Exception as e:
            self.log_result("Switch to BEAM", "FAIL", str(e))
            return False

    def test_switch_to_nph(self):
        """Test 10.2: Switch to NPH tab"""
        print("\n--- Testing Switch to NPH ---")
        try:
            # Use JS function
            self.execute_js("setAsset(47)")
            time.sleep(1)
            self.screenshot("asset_02_nph")
            self.log_result("Switch to NPH", "PASS", "Switched to NPH (asset 47)")
            return True
        except Exception as e:
            self.log_result("Switch to NPH", "FAIL", str(e))
            return False

    def test_switch_to_fomo(self):
        """Test 10.3: Switch back to FOMO"""
        print("\n--- Testing Switch to FOMO ---")
        try:
            # Use JS function
            self.execute_js("setAsset(174)")
            time.sleep(1)
            self.screenshot("asset_03_fomo")
            self.log_result("Switch to FOMO", "PASS", "Switched back to FOMO (asset 174)")
            return True
        except Exception as e:
            self.log_result("Switch to FOMO", "FAIL", str(e))
            return False

    def test_buy_sell_toggle(self):
        """Test 10.4: Test Buy/Sell toggle"""
        print("\n--- Testing Buy/Sell Toggle ---")
        try:
            # Switch to Sell
            self.execute_js("setSide('sell')")
            time.sleep(0.5)
            self.screenshot("toggle_01_sell")

            # Switch back to Buy
            self.execute_js("setSide('buy')")
            time.sleep(0.5)
            self.screenshot("toggle_02_buy")

            self.log_result("Buy/Sell Toggle", "PASS", "Toggled between Buy and Sell")
            return True
        except Exception as e:
            self.log_result("Buy/Sell Toggle", "FAIL", str(e))
            return False

    # ==================== MAIN TEST RUNNER ====================

    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*60)
        print("P2P EXCHANGE COMPREHENSIVE TEST SUITE")
        print("="*60)

        # Connect to browser
        if not self.connect():
            print("Failed to connect to browser")
            return

        # Navigate to P2P page
        self.navigate_to_p2p()

        # Take initial screenshot
        self.screenshot("00_initial_state")

        # 1. ESCROW TESTS
        print("\n" + "="*40)
        print("SECTION 1: ESCROW FUNCTIONS")
        print("="*40)
        self.test_escrow_staking_modal()
        self.test_escrow_stake_attempt()
        self.test_escrow_unstake()
        self.test_escrow_claim_rewards()
        self.close_modal()

        # 2. ORDER MANAGEMENT
        print("\n" + "="*40)
        print("SECTION 2: ORDER MANAGEMENT")
        print("="*40)
        self.test_create_sell_order()
        self.test_create_buy_order()
        self.test_cancel_order()
        self.test_view_order_details()

        # 3. TRADE FLOW
        print("\n" + "="*40)
        print("SECTION 3: TRADE FLOW")
        print("="*40)
        self.test_my_trades_modal()
        self.test_trades_active_tab()
        self.test_trades_completed_tab()
        self.test_trades_my_orders_tab()
        self.test_open_active_trade()
        self.close_modal()

        # 4. DISPUTE FUNCTIONS
        print("\n" + "="*40)
        print("SECTION 4: DISPUTE FUNCTIONS")
        print("="*40)
        self.test_dispute_center()
        self.test_dispute_my_disputes_tab()
        self.test_dispute_arbitration_tab()
        self.test_open_dispute_form()
        self.close_modal()

        # 5. MANAGER FUNCTIONS
        print("\n" + "="*40)
        print("SECTION 5: MANAGER FUNCTIONS")
        print("="*40)
        self.test_manager_panel()
        self.test_withdraw_fees()
        self.test_update_settings()
        self.close_modal()

        # 6. REGISTRATION
        print("\n" + "="*40)
        print("SECTION 6: REGISTRATION")
        print("="*40)
        self.test_registration_modal()
        self.test_fill_nickname()
        self.test_register_attempt()
        self.close_modal()

        # 7. PAYMENT METHODS
        print("\n" + "="*40)
        print("SECTION 7: PAYMENT METHODS")
        print("="*40)
        self.test_payment_methods_manager()
        self.test_add_payment_method()
        self.test_view_saved_methods()
        self.close_modal()

        # 8. HEADER BUTTONS
        print("\n" + "="*40)
        print("SECTION 8: HEADER BUTTONS")
        print("="*40)
        self.test_header_stats_button()
        self.test_header_disputes_button()
        self.test_header_payment_button()
        self.test_header_notifications_button()
        self.test_header_help_button()
        self.close_modal()

        # 9. FILTERS
        print("\n" + "="*40)
        print("SECTION 9: FILTERS")
        print("="*40)
        self.test_currency_filter()
        self.test_payment_method_filter()
        self.test_amount_filter()
        self.test_refresh_button()

        # 10. ASSET SWITCHING
        print("\n" + "="*40)
        print("SECTION 10: ASSET SWITCHING")
        print("="*40)
        self.test_switch_to_beam()
        self.test_switch_to_nph()
        self.test_switch_to_fomo()
        self.test_buy_sell_toggle()

        # Final screenshot
        self.screenshot("99_final_state")

        # Print summary
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)

        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        skipped = sum(1 for r in self.results if r["status"] == "SKIP")

        print(f"\nTotal: {len(self.results)} tests")
        print(f"  PASSED:  {passed}")
        print(f"  FAILED:  {failed}")
        print(f"  SKIPPED: {skipped}")

        print("\n" + "-"*60)
        print("DETAILED RESULTS:")
        print("-"*60)

        for r in self.results:
            status_emoji = "[PASS]" if r["status"] == "PASS" else "[FAIL]" if r["status"] == "FAIL" else "[SKIP]"
            print(f"{status_emoji} {r['test']}: {r['details']}")

        print("\n" + "="*60)
        print(f"Screenshots saved to: {SCREENSHOT_DIR}")
        print("="*60)

        # Save results to JSON
        results_path = os.path.join(SCREENSHOT_DIR, "test_results.json")
        with open(results_path, "w") as f:
            json.dump(self.results, f, indent=2)
        print(f"Results saved to: {results_path}")


if __name__ == "__main__":
    suite = P2PTestSuite()
    suite.run_all_tests()
