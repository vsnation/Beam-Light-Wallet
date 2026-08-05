#!/usr/bin/env python3
"""
P2P Escrow Contract - Complete Browser Test Suite

Tests ALL P2P smart contract methods through the browser UI.
Uses existing Chrome debug session on port 9222.
"""

import os
import sys
import time
import json
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# Config
BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "tests/screenshots/p2p_complete"
P2P_CONTRACT_ID = "95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf"

WALLETS = {
    "test_wallet": {"password": os.environ.get('BEAM_TEST_PASSWORD', ''), "role": "seller"},
    "test_2": {"password": "test_2", "role": "buyer"}
}


class P2PCompleteTest:
    def __init__(self):
        self.driver = None
        self.wait = None
        self.step = 0
        self.current_wallet = None
        self.in_iframe = False
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def log(self, msg, icon="ℹ️"):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {icon} {msg}")

    def screenshot(self, name):
        self.step += 1
        path = f"{SCREENSHOT_DIR}/{self.step:02d}_{name}.png"
        self.driver.save_screenshot(path)
        self.log(f"Screenshot: {path}", "📸")
        return path

    def connect(self):
        """Connect to Chrome debug session"""
        self.log("Connecting to Chrome debug session...", "🔌")
        options = webdriver.ChromeOptions()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 15)
        self.log("Connected!", "✅")
        return self

    def js(self, script):
        """Execute JavaScript"""
        return self.driver.execute_script(script)

    def switch_to_iframe(self):
        """Switch to P2P iframe"""
        if self.in_iframe:
            return
        try:
            iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
            if iframes:
                self.driver.switch_to.frame(iframes[0])
                self.in_iframe = True
                self.log("Switched to P2P iframe", "🔄")
        except Exception as e:
            self.log(f"Iframe switch error: {e}", "⚠️")

    def switch_to_main(self):
        """Switch back to main frame"""
        if self.in_iframe:
            self.driver.switch_to.default_content()
            self.in_iframe = False

    def close_modals(self):
        """Close any open modals"""
        self.js("""
            document.querySelectorAll('.modal').forEach(m => {
                m.classList.remove('active', 'show');
                m.style.display = 'none';
            });
        """)
        time.sleep(0.3)

    def unlock_wallet(self, wallet_name):
        """Unlock wallet through welcome screen"""
        self.log(f"Unlocking wallet: {wallet_name}", "🔐")
        self.switch_to_main()
        self.in_iframe = False

        self.driver.get(f"{BASE_URL}/")
        time.sleep(3)
        self.screenshot(f"welcome_{wallet_name}")

        # Check if already unlocked (multiple selectors for robustness)
        already_unlocked = self.js("""
            return document.querySelector('.dashboard-container, .total-balance-amount, .balance-section, .nav-item, #lock-wallet-btn') !== null
                || document.querySelector('.asset-card, .wallet-header') !== null
                || window.location.pathname.includes('/dashboard')
                || (typeof window.walletStatus !== 'undefined' && window.walletStatus !== null);
        """)
        if already_unlocked:
            self.log("Wallet already unlocked", "✅")
            self.current_wallet = wallet_name
            return True

        # Check for welcome screen
        has_welcome = self.js("return document.getElementById('welcome-wallet-select') !== null || document.querySelector('.welcome-container') !== null")
        if not has_welcome:
            # One more check - maybe we're on another page but wallet is connected
            is_connected = self.js("return document.body.textContent.includes('Lock') || document.body.textContent.includes('BEAM')")
            if is_connected:
                self.log("Wallet appears to be connected", "✅")
                self.current_wallet = wallet_name
                return True
            self.log("Welcome screen not found", "⚠️")
            return False

        password = WALLETS[wallet_name]["password"]
        self.js(f"""
            const select = document.getElementById('welcome-wallet-select');
            if (select) {{
                for (let opt of select.options) {{
                    if (opt.value.includes('{wallet_name}')) {{
                        select.value = opt.value;
                        break;
                    }}
                }}
            }}
            document.getElementById('welcome-password').value = '{password}';
        """)
        time.sleep(0.5)
        self.screenshot(f"unlock_{wallet_name}_filled")

        self.js("document.getElementById('welcome-unlock-btn')?.click()")

        self.log("Waiting for wallet to unlock...", "⏳")
        for i in range(30):
            time.sleep(1)
            if self.js("return document.querySelector('.dashboard-container, .total-balance-amount') !== null"):
                self.log("Wallet unlocked!", "✅")
                self.current_wallet = wallet_name
                self.screenshot(f"unlocked_{wallet_name}")
                return True

        self.log("Wallet unlock timeout", "❌")
        return False

    def lock_wallet(self):
        """Lock current wallet"""
        self.log("Locking wallet...", "🔒")
        self.switch_to_main()
        self.in_iframe = False
        self.js("document.querySelector('#lock-wallet-btn, [onclick*=lockWallet]')?.click()")
        time.sleep(2)
        self.current_wallet = None

    def switch_wallet(self, wallet_name):
        """Switch to different wallet"""
        self.log(f"Switching to wallet: {wallet_name}", "🔄")
        self.lock_wallet()
        time.sleep(2)
        return self.unlock_wallet(wallet_name)

    def goto_p2p(self):
        """Navigate to P2P marketplace"""
        self.log("Opening P2P Marketplace", "🏪")
        self.switch_to_main()
        self.in_iframe = False
        self.driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)
        self.switch_to_iframe()
        self.screenshot("p2p_page")
        return True

    def setup_payment_methods(self):
        """Add payment methods to localStorage and state"""
        self.log("Setting up payment methods", "💳")
        self.switch_to_iframe()
        self.js("""
            const methods = {
                'bank_transfer': {
                    fields: {
                        bank_name: 'Test Bank',
                        account_number: '1234567890',
                        routing: 'TESTSWIFT',
                        holder_name: 'Test User'
                    },
                    accountInfo: 'Bank Name: Test Bank\\nAccount: 1234567890\\nSWIFT: TESTSWIFT\\nHolder: Test User',
                    methodName: 'Bank Transfer',
                    updatedAt: Date.now()
                },
                'paypal': {
                    fields: {
                        email: 'test@paypal.com',
                        holder_name: 'Test User'
                    },
                    accountInfo: 'Email: test@paypal.com\\nName: Test User',
                    methodName: 'PayPal',
                    updatedAt: Date.now()
                }
            };
            localStorage.setItem('p2p_payment_credentials', JSON.stringify(methods));
            if (window.state) {
                window.state.savedPaymentAccounts = methods;
                console.log('Payment methods set in state:', Object.keys(methods));
            }
        """)
        self.log("Payment methods saved", "✅")
        return True

    def test_create_order(self, side="sell", amount=0.05, price=0.01):
        """Method 3: create_order"""
        print("\n" + "="*60)
        print(f"🧪 CREATE {side.upper()} ORDER")
        print("="*60)

        self.goto_p2p()

        # Setup payment methods in localStorage (persists across refresh)
        self.js("""
            const methods = {
                'bank_transfer': {
                    fields: {
                        bank_name: 'Test Bank',
                        account_number: '1234567890',
                        routing: 'TESTSWIFT',
                        holder_name: 'Test User'
                    },
                    accountInfo: 'Bank Name: Test Bank\\nAccount: 1234567890\\nSWIFT: TESTSWIFT\\nHolder: Test User',
                    methodName: 'Bank Transfer',
                    updatedAt: Date.now()
                }
            };
            localStorage.setItem('p2p_payment_credentials', JSON.stringify(methods));
        """)
        self.log("Payment methods saved to localStorage", "💳")

        # Reload to pick up localStorage
        self.switch_to_main()
        self.in_iframe = False
        self.driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)
        self.switch_to_iframe()

        # Wait for P2P JS to load
        for i in range(10):
            if self.js("return typeof showCreateOrder === 'function'"):
                break
            time.sleep(0.5)

        # Set side and open modal
        self.js(f"setSide && setSide('{side}')")
        time.sleep(0.5)

        # Trigger show create order function
        self.js("showCreateOrder && showCreateOrder()")
        time.sleep(1)
        self.screenshot("create_order_modal")

        # Fill form
        self.js(f"""
            // Set values
            document.getElementById('create-amount').value = '{amount}';
            document.getElementById('create-price').value = '{price}';
            document.getElementById('create-min-limit').value = '0.01';
            document.getElementById('create-max-limit').value = '10';

            // Trigger input events
            ['create-amount', 'create-price', 'create-min-limit', 'create-max-limit'].forEach(id => {{
                const el = document.getElementById(id);
                if (el) {{
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }});

            // Check bank_transfer payment method checkbox
            const bankCheckbox = document.querySelector('input[name="create-payment"][value="bank_transfer"]');
            if (bankCheckbox && !bankCheckbox.checked) {{
                bankCheckbox.checked = true;
                bankCheckbox.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}

            // Also check first available payment method as fallback
            const cbs = document.querySelectorAll('input[name="create-payment"]');
            if (cbs.length > 0 && !Array.from(cbs).some(cb => cb.checked)) {{
                cbs[0].checked = true;
            }}

            // Check terms checkbox
            const terms = document.getElementById('create-terms');
            if (terms && !terms.checked) {{
                terms.checked = true;
                terms.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}
        """)
        time.sleep(0.5)
        self.screenshot("create_order_filled")

        # Check if payment method is showing correctly
        has_valid_payment = self.js("""
            const selected = Array.from(document.querySelectorAll('input[name="create-payment"]:checked')).map(cb => cb.value);
            const details = window.getSelectedPaymentDetails ? getSelectedPaymentDetails() : '';
            console.log('Selected payments:', selected, 'Details:', details);
            return details && details.trim().length > 0;
        """)

        if not has_valid_payment:
            self.log("Payment method details missing, trying to set directly", "⚠️")
            # Force set payment methods
            self.js("""
                if (window.state) {
                    window.state.savedPaymentAccounts = {
                        'bank_transfer': {
                            accountInfo: 'Bank: Test Bank\\nAccount: 1234567890',
                            methodName: 'Bank Transfer'
                        }
                    };
                }
            """)

        self.log("Submitting order...", "🔘")
        self.js("submitCreateOrder && submitCreateOrder()")
        time.sleep(3)
        self.screenshot("create_order_result")

        # Check for TX confirmation modal (uses 'show' class, not 'active')
        tx_visible = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('show')")
        if tx_visible:
            self.log("TX confirmation appeared!", "✅")
            self.screenshot("tx_confirm")
            self.js("confirmTransaction && confirmTransaction()")
            time.sleep(5)
            self.screenshot("tx_sent")
            self.log("Order created on blockchain!", "✅")
            return True

        # Check for error toast
        error = self.js("return document.querySelector('.toast-error, .toast.error')?.textContent || ''")
        if error:
            self.log(f"Error: {error}", "❌")

        # Check console for errors
        console_log = self.js("""
            return window.lastError || '';
        """)
        if console_log:
            self.log(f"Console: {console_log}", "📝")

        return False

    def test_view_stats(self):
        """View contract stats"""
        print("\n" + "="*60)
        print("🧪 VIEW CONTRACT STATS")
        print("="*60)

        self.goto_p2p()
        self.js("showGlobalStats && showGlobalStats()")
        time.sleep(1)
        self.screenshot("global_stats")

        stats = self.js("""
            return {
                totalVolume: document.querySelector('.stat-card:nth-child(1) .stat-value')?.textContent,
                totalTrades: document.querySelector('.stat-card:nth-child(2) .stat-value')?.textContent,
                activeOrders: document.querySelector('.stat-card:nth-child(3) .stat-value')?.textContent,
            };
        """)
        if stats:
            self.log(f"Volume: {stats.get('totalVolume')}, Trades: {stats.get('totalTrades')}, Orders: {stats.get('activeOrders')}", "📊")

        self.close_modals()
        return True

    def test_view_orders(self):
        """View orders list from contract"""
        print("\n" + "="*60)
        print("🧪 VIEW ORDERS (Contract Method)")
        print("="*60)

        self.goto_p2p()
        time.sleep(2)
        self.screenshot("orders_list")

        # Try refreshing orders
        self.js("refreshOrders && refreshOrders()")
        time.sleep(3)
        self.screenshot("orders_refreshed")

        # Check for orders in the list
        orders_count = self.js("""
            const rows = document.querySelectorAll('.order-row, .orders-table tbody tr, .order-card');
            return rows ? rows.length : 0;
        """)
        self.log(f"Found {orders_count} orders in UI", "📊")

        return True

    def test_my_trades(self):
        """View my trades from contract"""
        print("\n" + "="*60)
        print("🧪 VIEW MY TRADES")
        print("="*60)

        self.goto_p2p()

        # Click My Trades button
        self.js("showMyTrades && showMyTrades()")
        time.sleep(2)
        self.screenshot("my_trades_modal")

        trades_count = self.js("""
            const modal = document.getElementById('my-trades-modal');
            if (!modal) return 0;
            const rows = modal.querySelectorAll('.trade-item, .trade-row, tbody tr');
            return rows ? rows.length : 0;
        """)
        self.log(f"Found {trades_count} trades", "📊")

        self.close_modals()
        return True

    def test_escrow_staking(self):
        """Test escrow staking panel"""
        print("\n" + "="*60)
        print("🧪 ESCROW STAKING")
        print("="*60)

        self.goto_p2p()

        # Click Escrow Staking button
        self.js("showEscrowStaking && showEscrowStaking()")
        time.sleep(2)
        self.screenshot("escrow_staking_modal")

        # Check current stake info
        stake_info = self.js("""
            return {
                currentStake: document.querySelector('.current-stake-value, #current-stake')?.textContent,
                minStake: document.querySelector('.min-stake-value, #min-stake')?.textContent,
                rewards: document.querySelector('.rewards-value, #escrow-rewards')?.textContent
            };
        """)
        if stake_info:
            self.log(f"Stake: {stake_info.get('currentStake')}, Min: {stake_info.get('minStake')}, Rewards: {stake_info.get('rewards')}", "💰")

        self.close_modals()
        return True

    def test_manager_panel(self):
        """Test manager panel access"""
        print("\n" + "="*60)
        print("🧪 MANAGER PANEL")
        print("="*60)

        self.goto_p2p()

        # Check if manager button is visible
        is_manager = self.js("""
            const btn = document.getElementById('manager-menu-btn');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            return style.display !== 'none' && style.visibility !== 'hidden';
        """)

        if is_manager:
            self.log("User IS a manager!", "👑")
            self.js("showManagerPanel && showManagerPanel()")
            time.sleep(2)
            self.screenshot("manager_panel")

            # Check manager panel contents
            manager_info = self.js("""
                return {
                    totalFees: document.querySelector('.total-fees-value, #manager-total-fees')?.textContent,
                    pendingDisputes: document.querySelector('.pending-disputes-value, #pending-disputes')?.textContent,
                    managerCount: document.querySelectorAll('.manager-item, .manager-row').length
                };
            """)
            if manager_info:
                self.log(f"Fees: {manager_info.get('totalFees')}, Disputes: {manager_info.get('pendingDisputes')}", "📊")

            self.close_modals()
            return True
        else:
            self.log("User is NOT a manager", "⚠️")
            return False

    def test_cancel_order(self, order_id=None):
        """Test canceling an order"""
        print("\n" + "="*60)
        print("🧪 CANCEL ORDER")
        print("="*60)

        self.goto_p2p()

        # Check My Trades for active orders
        self.js("showMyTrades && showMyTrades()")
        time.sleep(2)
        self.screenshot("my_trades_before_cancel")

        # Try to find a cancel button
        has_cancel = self.js("""
            const cancelBtn = document.querySelector('.cancel-order-btn, [onclick*="cancelOrder"], button:contains("Cancel")');
            return !!cancelBtn;
        """)

        if has_cancel:
            self.log("Found order to cancel", "🔍")
            self.js("document.querySelector('.cancel-order-btn, [onclick*=\"cancelOrder\"]')?.click()")
            time.sleep(2)
            self.screenshot("cancel_order_confirm")

            # Confirm if needed
            tx_visible = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('show')")
            if tx_visible:
                self.js("confirmTransaction && confirmTransaction()")
                time.sleep(3)
                self.screenshot("cancel_order_result")
                self.log("Order cancelled!", "✅")
                return True
        else:
            self.log("No orders to cancel", "⚠️")

        self.close_modals()
        return False

    def test_full_trade_flow(self):
        """
        Test complete trade flow with two wallets:
        1. Seller (test_wallet) creates order
        2. Buyer (test_2) accepts order
        3. Buyer marks payment sent
        4. Seller confirms payment
        5. Buyer claims funds
        """
        print("\n" + "="*60)
        print("🧪 FULL TRADE FLOW (2 Wallets)")
        print("="*60)

        # Step 1: Create order as seller
        self.log("Step 1: Creating sell order as test_wallet", "1️⃣")
        if self.current_wallet != "test_wallet":
            self.switch_wallet("test_wallet")
        self.test_create_order(side="sell", amount=0.05, price=0.01)

        # Wait for order to appear on chain
        self.log("Waiting for order to confirm on blockchain...", "⏳")
        time.sleep(10)

        # Step 2: Switch to buyer wallet
        self.log("Step 2: Switching to buyer wallet (test_2)", "2️⃣")
        self.switch_wallet("test_2")
        self.goto_p2p()

        # Refresh orders
        self.js("refreshOrders && refreshOrders()")
        time.sleep(3)
        self.screenshot("buyer_sees_orders")

        # Try to accept first available order
        has_order = self.js("""
            const buyBtn = document.querySelector('.trade-btn, .accept-btn, [onclick*="startTrade"]');
            if (buyBtn) {
                buyBtn.click();
                return true;
            }
            return false;
        """)

        if has_order:
            self.log("Found and clicked on order", "🔍")
            time.sleep(2)
            self.screenshot("accept_order_modal")

            # Fill accept amount and confirm
            self.js("""
                const amountInput = document.querySelector('#accept-amount, .accept-amount-input');
                if (amountInput) amountInput.value = '0.05';
            """)
            self.js("acceptOrder && acceptOrder()")
            time.sleep(2)

            # Confirm transaction
            tx_visible = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('show')")
            if tx_visible:
                self.log("Confirming accept order transaction", "✅")
                self.screenshot("accept_order_tx_confirm")
                self.js("confirmTransaction && confirmTransaction()")
                time.sleep(5)
                self.screenshot("accept_order_result")

                # Step 3: Mark payment sent
                self.log("Step 3: Marking payment as sent", "3️⃣")
                time.sleep(2)
                self.js("showMyTrades && showMyTrades()")
                time.sleep(2)

                # Find the trade and click mark payment sent
                self.js("""
                    const payBtn = document.querySelector('.mark-paid-btn, [onclick*="markPaymentSent"]');
                    if (payBtn) payBtn.click();
                """)
                time.sleep(2)
                self.screenshot("mark_payment_sent")

                tx_visible = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('show')")
                if tx_visible:
                    self.js("confirmTransaction && confirmTransaction()")
                    time.sleep(5)
                    self.log("Payment marked as sent!", "✅")

                # Step 4: Switch back to seller and confirm
                self.log("Step 4: Seller confirms payment (test_wallet)", "4️⃣")
                self.switch_wallet("test_wallet")
                self.goto_p2p()
                self.js("showMyTrades && showMyTrades()")
                time.sleep(2)
                self.screenshot("seller_my_trades")

                # Find confirm button
                self.js("""
                    const confirmBtn = document.querySelector('.confirm-payment-btn, [onclick*="confirmPayment"]');
                    if (confirmBtn) confirmBtn.click();
                """)
                time.sleep(2)

                tx_visible = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('show')")
                if tx_visible:
                    self.screenshot("confirm_payment_tx")
                    self.js("confirmTransaction && confirmTransaction()")
                    time.sleep(5)
                    self.log("Payment confirmed by seller!", "✅")

                    # Step 5: Buyer claims
                    self.log("Step 5: Buyer claims funds (test_2)", "5️⃣")
                    self.switch_wallet("test_2")
                    self.goto_p2p()
                    self.js("showMyTrades && showMyTrades()")
                    time.sleep(2)

                    # Find claim button
                    self.js("""
                        const claimBtn = document.querySelector('.claim-btn, [onclick*="claimTrade"]');
                        if (claimBtn) claimBtn.click();
                    """)
                    time.sleep(2)

                    tx_visible = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('show')")
                    if tx_visible:
                        self.screenshot("claim_trade_tx")
                        self.js("confirmTransaction && confirmTransaction()")
                        time.sleep(5)
                        self.log("Trade completed! Funds claimed!", "🎉")
                        self.screenshot("trade_completed")
                        return True
        else:
            self.log("No orders found to accept", "⚠️")

        return False

    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*70)
        print("🧪 P2P COMPLETE TEST SUITE")
        print("="*70)

        try:
            self.connect()

            if not self.unlock_wallet("test_wallet"):
                self.log("Failed to unlock wallet", "❌")
                return

            # Basic view tests
            self.test_view_stats()
            self.test_view_orders()

            # Create order test
            self.test_create_order()

            # Wait for order to appear
            self.log("Waiting for order to confirm...", "⏳")
            time.sleep(10)

            # View tests after order creation
            self.test_my_trades()
            self.test_escrow_staking()

            # Manager panel (if manager)
            self.test_manager_panel()

            print("\n" + "="*70)
            print("✅ TESTS COMPLETED")
            print(f"📁 Screenshots: {SCREENSHOT_DIR}")
            print("="*70)

        except Exception as e:
            self.log(f"Error: {e}", "❌")
            self.screenshot("error")
            raise

    def run_full_flow(self):
        """Run complete trade flow with two wallets"""
        print("\n" + "="*70)
        print("🧪 P2P FULL TRADE FLOW TEST")
        print("="*70)

        try:
            self.connect()

            if not self.unlock_wallet("test_wallet"):
                self.log("Failed to unlock seller wallet", "❌")
                return

            self.test_full_trade_flow()

            print("\n" + "="*70)
            print("✅ FULL TRADE FLOW COMPLETED")
            print(f"📁 Screenshots: {SCREENSHOT_DIR}")
            print("="*70)

        except Exception as e:
            self.log(f"Error: {e}", "❌")
            self.screenshot("error")
            raise


if __name__ == "__main__":
    test = P2PCompleteTest()
    if len(sys.argv) > 1:
        action = sys.argv[1]
        test.connect()
        if action == "unlock":
            test.unlock_wallet(sys.argv[2] if len(sys.argv) > 2 else "test_wallet")
        elif action == "create":
            test.unlock_wallet("test_wallet")
            test.test_create_order()
        elif action == "stats":
            test.unlock_wallet("test_wallet")
            test.test_view_stats()
        elif action == "orders":
            test.unlock_wallet("test_wallet")
            test.test_view_orders()
        elif action == "trades":
            test.unlock_wallet("test_wallet")
            test.test_my_trades()
        elif action == "escrow":
            test.unlock_wallet("test_wallet")
            test.test_escrow_staking()
        elif action == "manager":
            test.unlock_wallet("test_wallet")
            test.test_manager_panel()
        elif action == "cancel":
            test.unlock_wallet("test_wallet")
            test.test_cancel_order()
        elif action == "flow":
            test.run_full_flow()
        else:
            print(f"Unknown action: {action}")
            print("Available: unlock, create, stats, orders, trades, escrow, manager, cancel, flow")
    else:
        test.run_all_tests()
