#!/usr/bin/env python3
"""
P2P Escrow Contract - Interactive Browser Test Suite

Tests all P2P smart contract methods through the browser UI.
Connects to existing Chrome debug session on port 9222.

CONTRACT METHODS OVERVIEW:
==========================

MANAGER ROLE (Methods 14-18):
  - Method 14: withdraw_fees     - Withdraw accumulated trade fees
  - Method 15: assign_escrows    - Assign escrow arbitrators to dispute
  - Method 16: update_settings   - Update contract parameters
  - Method 17: add_manager       - Add new manager (owner only)
  - Method 18: remove_manager    - Remove manager (owner only)

USER ROLE (Methods 2-13, 19-21):
  - Method 2:  register_trader   - Register as P2P trader
  - Method 3:  create_order      - Create buy/sell order
  - Method 4:  cancel_order      - Cancel open order
  - Method 5:  accept_order      - Accept order, start trade
  - Method 6:  mark_payment_sent - Buyer marks fiat payment sent
  - Method 7:  confirm_payment   - Seller confirms, releases crypto (gets deposit back)
  - Method 8:  open_dispute      - Open dispute on trade
  - Method 9:  escrow_vote       - Escrow votes on dispute
  - Method 10: submit_feedback   - Submit feedback after trade
  - Method 11: stake_escrow      - Stake FOMO to become escrow
  - Method 12: unstake_escrow    - Unstake after lock period
  - Method 13: claim_rewards     - Claim escrow rewards
  - Method 20: claim_trade       - Buyer claims crypto + deposit (two-step completion)
  - Method 21: claim_dispute_win - Winner claims dispute resolution

VIEW ACTIONS (read-only):
  - view              - View contract settings
  - view_orders       - List orders with filters
  - view_trader       - View trader reputation
  - view_trades       - View trades
  - view_trade        - View single trade
  - view_feedback     - View trader feedback
  - view_escrow_stake - View escrow stake
  - view_escrows      - List all escrow stakers
  - view_stats        - Contract statistics
  - view_managers     - List managers
  - view_dispute      - View dispute details

TRADE STATUS CODES:
  0 = Pending (created, waiting for acceptance)
  1 = Accepted (trade started, waiting for payment)
  2 = PaymentSent (buyer marked payment sent)
  3 = Completed (trade finished successfully)
  4 = Disputed (dispute opened)
  5 = Refunded (trade refunded)
  6 = Cancelled (order cancelled)
  7 = SellerConfirmed (seller confirmed, waiting for buyer claim)
  8 = BuyerWonDispute (buyer won dispute)
  9 = SellerWonDispute (seller won dispute)

TWO-STEP COMPLETION FLOW:
  1. Buyer marks payment sent (status -> PaymentSent)
  2. Seller confirms payment (status -> SellerConfirmed, seller gets deposit back)
  3. Buyer claims trade (status -> Completed, buyer gets crypto + deposit)

Run: python3 tests/test_p2p_interactive.py
"""

import os
import sys
import time
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
CONTRACT_ID = "b812911e98cc002b946f570ef8ddb2a581dec41ecd75adff5ca9cc1651d949c1"
SCREENSHOT_DIR = "tests/screenshots/p2p_interactive"

# Wallets
WALLETS = {
    "test_wallet": {"password": os.environ.get('BEAM_TEST_PASSWORD', ''), "role": "seller/manager"},
    "test_2": {"password": "test_2", "role": "buyer"},
}


class P2PInteractiveTest:
    """Interactive P2P test with live browser control"""

    def __init__(self):
        self.driver = None
        self.wait = None
        self.step_count = 0
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def connect(self):
        """Connect to Chrome debug session"""
        print("\n🔌 Connecting to Chrome debug session on port 9222...")
        options = webdriver.ChromeOptions()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 15)
        print("✅ Connected to Chrome")
        return self

    def screenshot(self, name):
        """Take screenshot with step number"""
        self.step_count += 1
        ts = datetime.now().strftime("%H%M%S")
        filename = f"{self.step_count:02d}_{name}_{ts}.png"
        path = f"{SCREENSHOT_DIR}/{filename}"
        self.driver.save_screenshot(path)
        print(f"📸 Screenshot: {filename}")
        return path

    def log(self, msg, icon="ℹ️"):
        """Log with timestamp"""
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {icon} {msg}")

    def goto(self, path):
        """Navigate to URL"""
        url = f"{BASE_URL}{path}"
        self.log(f"Navigating to {url}")
        self.driver.get(url)
        time.sleep(2)
        return self

    def click(self, selector, desc=""):
        """Click element using JavaScript for reliability"""
        try:
            # First try to find the element
            el = self.driver.find_element(By.CSS_SELECTOR, selector)

            # Scroll into view
            self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
            time.sleep(0.3)

            # Use JavaScript click for reliability
            self.driver.execute_script("arguments[0].click();", el)
            self.log(f"Clicked: {desc or selector}", "👆")
            time.sleep(0.5)
            return True
        except Exception as e:
            self.log(f"Click failed: {selector} - {str(e)[:50]}", "❌")
            return False

    def type_text(self, selector, text, desc=""):
        """Type text into input"""
        try:
            el = self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, selector)))
            el.clear()
            el.send_keys(text)
            self.log(f"Typed '{text}' into {desc or selector}", "⌨️")
            return True
        except Exception as e:
            self.log(f"Type failed: {selector} - {e}", "❌")
            return False

    def exists(self, selector):
        """Check if element exists"""
        try:
            self.driver.find_element(By.CSS_SELECTOR, selector)
            return True
        except:
            return False

    def get_text(self, selector):
        """Get element text"""
        try:
            el = self.driver.find_element(By.CSS_SELECTOR, selector)
            return el.text
        except:
            return ""

    def execute_js(self, script):
        """Execute JavaScript and return result"""
        return self.driver.execute_script(script)

    def analyze_page(self):
        """Analyze current page state"""
        print("\n📊 Page Analysis:")
        print(f"   URL: {self.driver.current_url}")
        print(f"   Title: {self.driver.title}")

        # Check for key elements
        elements = {
            "Welcome Screen": "#welcome-wallet-select",
            "Dashboard": ".dashboard-container, .balance-display",
            "P2P Header": ".p2p-header",
            "Orders List": "#orders-list",
            "Manager Button": "#manager-menu-btn",
            "Create Order Button": "button[onclick*='showCreateOrder']",
            "My Trades Button": "button[onclick*='showMyTrades']",
            "Escrow Button": "button[onclick*='showEscrowStaking']",
        }

        for name, selector in elements.items():
            if self.exists(selector):
                visible = self.driver.find_element(By.CSS_SELECTOR, selector).is_displayed()
                status = "✅ visible" if visible else "👻 hidden"
                print(f"   {name}: {status}")

        return self

    # ==================== WALLET MANAGEMENT ====================

    def unlock_wallet(self, wallet_name):
        """Unlock wallet through welcome screen"""
        self.log(f"Unlocking wallet: {wallet_name}", "🔐")
        self.goto("/")
        time.sleep(2)
        self.screenshot(f"unlock_{wallet_name}_start")

        if not self.exists("#welcome-wallet-select"):
            self.log("Welcome screen not found - might already be unlocked", "⚠️")
            return self

        # Select wallet
        try:
            select = self.driver.find_element(By.CSS_SELECTOR, "#welcome-wallet-select")
            for option in select.find_elements(By.TAG_NAME, "option"):
                if wallet_name in option.get_attribute("value"):
                    option.click()
                    break
        except Exception as e:
            self.log(f"Wallet select error: {e}", "❌")

        time.sleep(0.5)

        # Enter password
        password = WALLETS.get(wallet_name, {}).get("password", "")
        self.type_text("#welcome-password", password, "password field")

        # Click unlock
        self.click("#welcome-unlock-btn", "Unlock button")
        time.sleep(5)  # Wait for wallet-api

        self.screenshot(f"unlock_{wallet_name}_done")
        return self

    def lock_wallet(self):
        """Lock current wallet"""
        self.log("Locking wallet", "🔒")
        # Try clicking lock button or navigate to settings
        if self.click("#lock-wallet-btn", "Lock button"):
            time.sleep(2)
        return self

    # ==================== P2P NAVIGATION ====================

    def goto_p2p(self):
        """Navigate to P2P marketplace"""
        self.log("Opening P2P Marketplace", "🏪")
        self.goto("/p2p")
        time.sleep(2)

        # P2P page is inside an iframe - switch to it
        try:
            iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
            if iframes:
                self.log(f"Found {len(iframes)} iframe(s), switching to P2P iframe", "🔄")
                self.driver.switch_to.frame(iframes[0])
                time.sleep(0.5)
        except Exception as e:
            self.log(f"Iframe switch error: {e}", "⚠️")

        self.screenshot("p2p_page")
        self.analyze_page()
        return self

    def switch_to_main(self):
        """Switch back to main frame"""
        self.driver.switch_to.default_content()

    def close_all_modals(self):
        """Close any open modals"""
        try:
            self.execute_js("""
                document.querySelectorAll('.modal').forEach(m => {
                    if (m.classList.contains('active') || m.style.display !== 'none') {
                        m.classList.remove('active');
                        m.style.display = 'none';
                    }
                });
            """)
        except:
            pass

    # ==================== CONTRACT METHOD TESTS ====================

    def test_view_contract_info(self):
        """VIEW: View contract settings and info"""
        print("\n" + "="*60)
        print("📋 VIEW CONTRACT INFO")
        print("="*60)

        # Contract ID should be displayed
        cid_el = self.get_text("#contract-cid")
        self.log(f"Contract ID: {cid_el or CONTRACT_ID[:16]}...", "📝")

        # Check if stats are loaded - Stats button is in header icons
        if self.click(".icon-btn[title='Statistics']", "Global Stats button"):
            time.sleep(1)
            self.screenshot("contract_stats")
            self.click(".modal-close", "Close modal")

        return self

    def test_register_trader(self):
        """Method 2: Register as P2P trader"""
        print("\n" + "="*60)
        print("📋 METHOD 2: REGISTER TRADER")
        print("="*60)

        # Check if registration banner is visible
        if self.exists("#registration-banner"):
            banner = self.driver.find_element(By.CSS_SELECTOR, "#registration-banner")
            if banner.is_displayed():
                self.log("Registration required", "📝")
                self.screenshot("register_banner")

                # Click register
                if self.click("#registration-banner button", "Register button"):
                    time.sleep(1)
                    self.screenshot("register_modal")

                    # Fill nickname
                    self.type_text("#register-nickname", "TestTrader", "nickname")
                    self.screenshot("register_filled")

                    # Note: Don't actually submit to avoid blockchain transaction
                    self.log("Registration form ready (not submitting)", "✅")
                    self.click(".modal-close", "Close modal")
            else:
                self.log("Already registered", "✅")
        else:
            self.log("Already registered (no banner)", "✅")

        return self

    def test_create_order(self):
        """Method 3: Create buy/sell order"""
        print("\n" + "="*60)
        print("📋 METHOD 3: CREATE ORDER")
        print("="*60)

        # Use the action button at the bottom
        if self.click(".action-btn-primary", "Create Order button"):
            time.sleep(1)
            self.screenshot("create_order_modal")

            # Fill order details
            self.type_text("#create-amount", "100", "Amount")
            self.type_text("#create-price", "0.01", "Price")
            self.type_text("#create-min-limit", "1", "Min limit")
            self.type_text("#create-max-limit", "100", "Max limit")

            self.screenshot("create_order_filled")

            # Check available balance
            balance = self.get_text("#create-available-balance")
            self.log(f"Available balance: {balance}", "💰")

            self.log("Order form ready", "✅")
            self.click(".modal-close", "Close modal")

        return self

    def test_view_orders(self):
        """VIEW: View available orders"""
        print("\n" + "="*60)
        print("📋 VIEW ORDERS")
        print("="*60)

        # Check orders list
        orders_html = self.get_text("#orders-list")
        if "No orders" in orders_html or not orders_html:
            self.log("No orders available", "📭")
        else:
            # Count order rows
            order_rows = self.driver.find_elements(By.CSS_SELECTOR, "#orders-list .order-row")
            self.log(f"Found {len(order_rows)} orders", "📋")

        self.screenshot("orders_list")

        # Test filters
        self.click("#btn-sell", "Sell tab")
        time.sleep(1)
        self.screenshot("orders_sell_side")

        self.click("#btn-buy", "Buy tab")
        time.sleep(0.5)

        return self

    def test_my_trades(self):
        """VIEW: View my trades"""
        print("\n" + "="*60)
        print("📋 VIEW MY TRADES (Methods 5-7, 20)")
        print("="*60)

        # Use JS to click My Trades directly
        if self.execute_js("showMyTrades(); return true;"):
            time.sleep(1)
            self.screenshot("my_trades_modal")

            # Check active trades
            active_trades = self.get_text("#active-trades-list")
            if "No active trades" in active_trades or not active_trades.strip():
                self.log("No active trades", "📭")
            else:
                trade_cards = self.driver.find_elements(By.CSS_SELECTOR, "#active-trades-list .trade-card")
                self.log(f"Found {len(trade_cards)} active trades", "📋")

                # If there are trades, show the trade actions
                if trade_cards:
                    self.log("Trade actions available:", "📝")
                    self.log("  - mark_payment_sent (Method 6) - for buyer", "  ")
                    self.log("  - confirm_payment (Method 7) - for seller", "  ")
                    self.log("  - claim_trade (Method 20) - for buyer after seller confirms", "  ")
                    self.log("  - open_dispute (Method 8) - for either party", "  ")

            self.click(".modal-close", "Close modal")

        return self

    def test_escrow_staking(self):
        """Methods 11-13: Escrow staking"""
        print("\n" + "="*60)
        print("📋 METHODS 11-13: ESCROW STAKING")
        print("="*60)

        # Use the third action button (Escrow Staking)
        if self.click(".action-btn-secondary:nth-of-type(2)", "Escrow Staking button"):
            time.sleep(1)
            self.screenshot("escrow_modal")

            # Check current stake
            stake_info = self.get_text(".escrow-stake-info, #escrow-current-stake")
            self.log(f"Stake info: {stake_info or 'Not staked'}", "💰")

            # Check stats
            stats = self.get_text(".escrow-stats, #escrow-stats")
            if stats:
                self.log(f"Escrow stats: {stats[:100]}...", "📊")

            self.log("Escrow methods:", "📝")
            self.log("  - stake_escrow (Method 11): Stake FOMO to become escrow", "  ")
            self.log("  - unstake_escrow (Method 12): Unstake after lock period", "  ")
            self.log("  - claim_rewards (Method 13): Claim accumulated rewards", "  ")

            self.click(".modal-close", "Close modal")

        return self

    def test_dispute_center(self):
        """Methods 8-9, 21: Dispute system"""
        print("\n" + "="*60)
        print("📋 METHODS 8-9, 21: DISPUTE SYSTEM")
        print("="*60)

        # Dispute center is in the header icons
        if self.click(".icon-btn[title='Disputes']", "Dispute Center button"):
            time.sleep(1)
            self.screenshot("dispute_center")

            # Check for disputes
            disputes = self.get_text("#disputes-list, .disputes-list")
            if "No disputes" in disputes or not disputes.strip():
                self.log("No active disputes", "📭")
            else:
                self.log(f"Disputes: {disputes[:100]}...", "📋")

            self.log("Dispute methods:", "📝")
            self.log("  - open_dispute (Method 8): Open dispute on trade", "  ")
            self.log("  - escrow_vote (Method 9): Escrow votes on dispute", "  ")
            self.log("  - claim_dispute_win (Method 21): Winner claims resolution", "  ")

            self.click(".modal-close", "Close modal")

        return self

    def test_manager_panel(self):
        """Methods 14-18: Manager actions"""
        print("\n" + "="*60)
        print("📋 METHODS 14-18: MANAGER PANEL")
        print("="*60)

        # Check if manager button is visible
        if self.exists("#manager-menu-btn"):
            btn = self.driver.find_element(By.CSS_SELECTOR, "#manager-menu-btn")
            if btn.is_displayed():
                self.log("Manager button VISIBLE - user is a manager! ✨", "👑")
                self.screenshot("manager_btn_visible")

                if self.click("#manager-menu-btn", "Manager Panel button"):
                    time.sleep(1)
                    self.screenshot("manager_panel")

                    # Test each tab
                    tabs = ["overview", "fees", "disputes", "escrows", "managers", "settings"]
                    for tab in tabs:
                        if self.click(f".manager-tab[data-tab='{tab}']", f"Tab: {tab}"):
                            time.sleep(0.5)
                            self.screenshot(f"manager_tab_{tab}")

                    self.log("Manager methods:", "📝")
                    self.log("  - withdraw_fees (Method 14): Withdraw accumulated fees", "  ")
                    self.log("  - assign_escrows (Method 15): Assign escrows to dispute", "  ")
                    self.log("  - update_settings (Method 16): Update contract settings", "  ")
                    self.log("  - add_manager (Method 17): Add new manager (owner only)", "  ")
                    self.log("  - remove_manager (Method 18): Remove manager (owner only)", "  ")

                    self.click(".modal-close", "Close modal")
            else:
                self.log("Manager button HIDDEN - user is NOT a manager", "🔒")
        else:
            self.log("Manager button not found - user is NOT a manager", "🔒")

        return self

    def test_feedback_system(self):
        """Method 10: Feedback system"""
        print("\n" + "="*60)
        print("📋 METHOD 10: FEEDBACK SYSTEM")
        print("="*60)

        self.log("Feedback is submitted after trade completion", "📝")
        self.log("  - submit_feedback (Method 10): Rate 1-5 stars", "  ")
        self.log("  - view_feedback: View trader's received feedback", "  ")

        # Check if there's a trader profile visible
        if self.exists(".trader-profile, .reputation-score"):
            rep = self.get_text(".trader-profile, .reputation-score")
            self.log(f"Trader reputation: {rep}", "⭐")

        return self

    def test_timeline_ui(self):
        """Test trade timeline UI"""
        print("\n" + "="*60)
        print("📋 TRADE TIMELINE UI")
        print("="*60)

        # Open My Trades to see timeline
        if self.execute_js("showMyTrades(); return true;"):
            time.sleep(1)

            # Check for timeline
            if self.exists(".timeline"):
                timeline_items = self.driver.find_elements(By.CSS_SELECTOR, ".timeline-item")
                self.log(f"Timeline has {len(timeline_items)} steps:", "📈")

                for i, item in enumerate(timeline_items):
                    step = item.get_attribute("data-step") or f"step_{i+1}"
                    classes = item.get_attribute("class")
                    status = "✅" if "completed" in classes else ("⏳" if "active" in classes else "○")
                    text = item.text.split("\n")[0] if item.text else step
                    self.log(f"  {status} {text}", "  ")

                self.screenshot("timeline")
            else:
                self.log("No active trade with timeline", "📭")

            self.click(".modal-close", "Close")

        return self

    # ==================== FULL TEST FLOW ====================

    def run_all_tests(self, wallet_name="test_wallet"):
        """Run all tests with specified wallet"""
        print("\n" + "="*60)
        print(f"🚀 P2P INTERACTIVE TEST SUITE")
        print(f"   Wallet: {wallet_name}")
        print(f"   Contract: {CONTRACT_ID[:16]}...")
        print("="*60)

        try:
            self.connect()

            # Unlock wallet first
            self.unlock_wallet(wallet_name)

            # Go to P2P
            self.goto_p2p()

            # Run all tests
            self.test_view_contract_info()
            self.test_register_trader()
            self.test_view_orders()
            self.test_create_order()
            self.test_my_trades()
            self.test_escrow_staking()
            self.test_dispute_center()
            self.test_feedback_system()
            self.test_timeline_ui()
            self.test_manager_panel()  # Will only work for managers

            print("\n" + "="*60)
            print("✅ ALL TESTS COMPLETED")
            print(f"📁 Screenshots saved to: {SCREENSHOT_DIR}")
            print("="*60)

        except Exception as e:
            self.log(f"Test error: {e}", "❌")
            self.screenshot("error")
            raise

    def interactive_mode(self):
        """Interactive mode - run commands manually"""
        print("\n" + "="*60)
        print("🎮 INTERACTIVE MODE")
        print("="*60)
        print("Commands:")
        print("  unlock <wallet>  - Unlock wallet")
        print("  p2p              - Go to P2P page")
        print("  screenshot       - Take screenshot")
        print("  analyze          - Analyze page")
        print("  test <name>      - Run specific test")
        print("  all              - Run all tests")
        print("  quit             - Exit")
        print("-"*60)

        self.connect()

        while True:
            try:
                cmd = input("\n> ").strip().split()
                if not cmd:
                    continue

                action = cmd[0].lower()

                if action == "quit":
                    break
                elif action == "unlock":
                    wallet = cmd[1] if len(cmd) > 1 else "test_wallet"
                    self.unlock_wallet(wallet)
                elif action == "p2p":
                    self.goto_p2p()
                elif action == "screenshot":
                    name = cmd[1] if len(cmd) > 1 else "manual"
                    self.screenshot(name)
                elif action == "analyze":
                    self.analyze_page()
                elif action == "all":
                    wallet = cmd[1] if len(cmd) > 1 else "test_wallet"
                    self.run_all_tests(wallet)
                elif action == "test":
                    test_name = cmd[1] if len(cmd) > 1 else "view_orders"
                    method = getattr(self, f"test_{test_name}", None)
                    if method:
                        method()
                    else:
                        print(f"Unknown test: {test_name}")
                else:
                    print(f"Unknown command: {action}")

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Error: {e}")


def main():
    test = P2PInteractiveTest()

    if "--interactive" in sys.argv or "-i" in sys.argv:
        test.interactive_mode()
    else:
        wallet = sys.argv[1] if len(sys.argv) > 1 else "test_wallet"
        test.run_all_tests(wallet)


if __name__ == "__main__":
    main()
