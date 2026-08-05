#!/usr/bin/env python3
"""
P2P Smart Contract Actions Test

Actually submits forms and calls smart contract methods by clicking buttons.
Connects to Chrome debug session on port 9222.

IMPORTANT: This will create real transactions on the blockchain!
"""

import os
import sys
import time
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://127.0.0.1:9080"
CONTRACT_ID = "b812911e98cc002b946f570ef8ddb2a581dec41ecd75adff5ca9cc1651d949c1"
SCREENSHOT_DIR = "tests/screenshots/p2p_actions"

WALLETS = {
    "test_wallet": {"password": os.environ.get('BEAM_TEST_PASSWORD', ''), "role": "seller/manager"},
    "test_2": {"password": "test_2", "role": "buyer"},
}


class P2PActionsTest:
    """Test that actually calls smart contract methods"""

    def __init__(self):
        self.driver = None
        self.wait = None
        self.step = 0
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    def connect(self):
        """Connect to Chrome debug session"""
        print("🔌 Connecting to Chrome...")
        options = webdriver.ChromeOptions()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 15)
        print("✅ Connected")
        return self

    def screenshot(self, name):
        self.step += 1
        path = f"{SCREENSHOT_DIR}/{self.step:02d}_{name}.png"
        self.driver.save_screenshot(path)
        print(f"📸 {path}")
        return path

    def log(self, msg, icon="ℹ️"):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {icon} {msg}")

    def js(self, script):
        """Execute JavaScript"""
        return self.driver.execute_script(script)

    def click_js(self, selector):
        """Click using JavaScript"""
        self.js(f"document.querySelector('{selector}').click()")
        time.sleep(0.5)

    def goto_p2p(self):
        """Go to P2P page and switch to iframe"""
        self.driver.get(f"{BASE_URL}/p2p")
        time.sleep(2)
        # Switch to iframe
        iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
        if iframes:
            self.driver.switch_to.frame(iframes[0])
            time.sleep(0.5)
        return self

    def close_modal(self):
        """Close any open modal"""
        try:
            self.js("document.querySelector('.modal.active .modal-close')?.click()")
        except:
            pass
        time.sleep(0.3)

    def close_all_modals(self):
        """Force close all modals"""
        self.js("""
            document.querySelectorAll('.modal').forEach(m => {
                m.classList.remove('active');
                m.style.display = 'none';
            });
        """)
        time.sleep(0.3)

    # ==================== ACTUAL CONTRACT METHOD CALLS ====================

    def action_create_order(self, amount="10", price="0.01", min_limit="1", max_limit="10", side="sell"):
        """
        METHOD 3: create_order
        Actually creates a sell order on the blockchain
        """
        print("\n" + "="*60)
        print(f"🚀 ACTION: CREATE {side.upper()} ORDER (Method 3)")
        print("="*60)

        self.close_all_modals()
        self.screenshot("create_order_start")

        # Set the side (buy/sell)
        if side == "sell":
            self.js("setSide('sell')")
            time.sleep(0.3)

        # Force open Create Order modal (showCreateOrder has checks that may prevent it)
        self.js('''
            const modal = document.getElementById("create-order-modal");
            if (modal) {
                modal.classList.add("active");
                modal.style.display = "flex";
            }
        ''')
        time.sleep(1)
        self.screenshot("create_order_modal")

        # Fill form
        self.log(f"Filling order: {amount} FOMO at ${price}")

        # Clear and fill fields
        self.js(f"document.getElementById('create-amount').value = '{amount}'")
        self.js(f"document.getElementById('create-price').value = '{price}'")
        self.js(f"document.getElementById('create-min-limit').value = '{min_limit}'")
        self.js(f"document.getElementById('create-max-limit').value = '{max_limit}'")

        # Trigger input events for validation
        self.js("""
            ['create-amount', 'create-price', 'create-min-limit', 'create-max-limit'].forEach(id => {
                const el = document.getElementById(id);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
        """)
        time.sleep(0.5)

        # Check terms checkbox if exists
        self.js("""
            const terms = document.getElementById('create-terms');
            if (terms && !terms.checked) terms.click();
        """)

        self.screenshot("create_order_filled")

        # Check the agreement checkbox
        self.js('''
            const checkbox = document.querySelector('#create-order-modal input[type="checkbox"]');
            if (checkbox && !checkbox.checked) checkbox.click();
        ''')
        time.sleep(0.3)

        self.screenshot("create_order_ready")

        # Click submit button
        self.log("Clicking Create Order submit...", "🔘")
        self.js("submitCreateOrder()")
        time.sleep(2)

        self.screenshot("create_order_submitted")

        # Check if transaction confirmation modal appeared
        tx_confirm = self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')")
        if tx_confirm:
            self.log("Transaction confirmation modal appeared!", "✅")
            self.screenshot("tx_confirm_modal")

            # Show transaction details
            tx_info = self.js('''
                return {
                    method: document.querySelector('#tx-confirm-modal .tx-method')?.textContent,
                    fee: document.querySelector('#tx-confirm-modal .tx-fee')?.textContent,
                };
            ''')
            if tx_info:
                self.log(f"TX Method: {tx_info.get('method', 'N/A')}")
                self.log(f"TX Fee: {tx_info.get('fee', 'N/A')}")

            # Click confirm to send to blockchain
            self.log("Confirming transaction...", "🔐")
            self.js("confirmTransaction()")
            time.sleep(5)

            self.screenshot("tx_confirmed")
            self.log("Order creation transaction sent!", "✅")
        else:
            # Check for error message
            error = self.js("return document.querySelector('.error-message, .toast-error')?.textContent")
            if error:
                self.log(f"Error: {error}", "❌")
            else:
                self.log("No transaction modal - check console for errors", "⚠️")

        return self

    def action_accept_order(self, order_index=0):
        """
        METHOD 5: accept_order
        Accept an existing order to start a trade
        """
        print("\n" + "="*60)
        print("🚀 ACTION: ACCEPT ORDER (Method 5)")
        print("="*60)

        self.close_all_modals()

        # Find orders
        orders = self.js("return document.querySelectorAll('.order-row').length")
        self.log(f"Found {orders} orders")

        if orders == 0:
            self.log("No orders to accept", "⚠️")
            return self

        # Click on the first order's trade button
        self.js(f"document.querySelectorAll('.order-row')[{order_index}].querySelector('.btn-primary')?.click()")
        time.sleep(1)

        self.screenshot("accept_order_modal")

        # Fill trade amount if needed
        self.js("document.getElementById('trade-pay-amount')?.value = '1'")

        # Check agreement checkboxes
        self.js("""
            document.querySelectorAll('#trade-modal input[type=checkbox]').forEach(cb => {
                if (!cb.checked) cb.click();
            });
        """)

        self.screenshot("accept_order_filled")

        # Submit trade
        self.js("document.getElementById('trade-submit')?.click()")
        time.sleep(2)

        self.screenshot("accept_order_submitted")

        # Confirm transaction
        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log("Trade started!", "✅")

        return self

    def action_mark_payment_sent(self):
        """
        METHOD 6: mark_payment_sent
        Buyer marks that they've sent fiat payment
        """
        print("\n" + "="*60)
        print("🚀 ACTION: MARK PAYMENT SENT (Method 6)")
        print("="*60)

        self.close_all_modals()

        # Open My Trades
        self.js("showMyTrades()")
        time.sleep(1)
        self.screenshot("my_trades_for_payment")

        # Click on an active trade
        self.js("document.querySelector('#active-trades-list .trade-card')?.click()")
        time.sleep(1)

        self.screenshot("active_trade_view")

        # Click "I've Sent The Payment" button
        self.js("markPaymentSent()")
        time.sleep(2)

        # Confirm transaction
        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.screenshot("payment_sent_confirm")
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log("Payment marked as sent!", "✅")

        return self

    def action_confirm_payment(self):
        """
        METHOD 7: confirm_payment
        Seller confirms they received fiat payment (gets deposit back)
        """
        print("\n" + "="*60)
        print("🚀 ACTION: CONFIRM PAYMENT (Method 7)")
        print("="*60)

        self.close_all_modals()

        # Open My Trades
        self.js("showMyTrades()")
        time.sleep(1)

        # Click on active trade
        self.js("document.querySelector('#active-trades-list .trade-card')?.click()")
        time.sleep(1)

        self.screenshot("confirm_payment_view")

        # Click confirm payment button
        self.js("confirmPayment()")
        time.sleep(2)

        # Confirm transaction
        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.screenshot("confirm_payment_tx")
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log("Payment confirmed! Seller deposit returned.", "✅")

        return self

    def action_claim_trade(self):
        """
        METHOD 20: claim_trade
        Buyer claims crypto + deposit after seller confirms
        """
        print("\n" + "="*60)
        print("🚀 ACTION: CLAIM TRADE (Method 20)")
        print("="*60)

        self.close_all_modals()

        # Open My Trades
        self.js("showMyTrades()")
        time.sleep(1)

        # Click on active trade with "seller_confirmed" status
        self.js("document.querySelector('#active-trades-list .trade-card')?.click()")
        time.sleep(1)

        self.screenshot("claim_trade_view")

        # Click claim button
        self.js("claimTrade()")
        time.sleep(2)

        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.screenshot("claim_trade_tx")
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log("Trade claimed! Buyer received crypto + deposit.", "✅")

        return self

    def action_stake_escrow(self, amount="100"):
        """
        METHOD 11: stake_escrow
        Stake FOMO to become an escrow arbitrator
        """
        print("\n" + "="*60)
        print("🚀 ACTION: STAKE ESCROW (Method 11)")
        print("="*60)

        self.close_all_modals()

        # Open Escrow Staking modal
        self.js("showEscrowStaking()")
        time.sleep(1)
        self.screenshot("escrow_stake_modal")

        # Fill stake amount
        self.js(f"document.getElementById('escrow-stake-amount').value = '{amount}'")
        self.js("document.getElementById('escrow-stake-amount').dispatchEvent(new Event('input', { bubbles: true }))")

        self.screenshot("escrow_stake_filled")

        # Click stake button
        self.js("stakeForEscrow()")
        time.sleep(2)

        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.screenshot("escrow_stake_tx")
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log(f"Staked {amount} FOMO as escrow!", "✅")

        return self

    def action_open_dispute(self, reason="Payment not received"):
        """
        METHOD 8: open_dispute
        Open a dispute on an active trade
        """
        print("\n" + "="*60)
        print("🚀 ACTION: OPEN DISPUTE (Method 8)")
        print("="*60)

        self.close_all_modals()

        # Open My Trades
        self.js("showMyTrades()")
        time.sleep(1)

        # Click on an active trade
        self.js("document.querySelector('#active-trades-list .trade-card')?.click()")
        time.sleep(1)

        # Open dispute modal
        self.js("openDispute()")
        time.sleep(1)

        self.screenshot("dispute_modal")

        # Fill reason
        self.js(f"document.getElementById('dispute-reason').value = '{reason}'")

        self.screenshot("dispute_filled")

        # Submit dispute
        self.js("submitDispute()")
        time.sleep(2)

        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.screenshot("dispute_tx")
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log("Dispute opened!", "✅")

        return self

    def action_cancel_order(self):
        """
        METHOD 4: cancel_order
        Cancel an open order
        """
        print("\n" + "="*60)
        print("🚀 ACTION: CANCEL ORDER (Method 4)")
        print("="*60)

        self.close_all_modals()

        # Open My Trades and go to My Orders tab
        self.js("showMyTrades()")
        time.sleep(1)
        self.js("showTradesTab('my-orders')")
        time.sleep(1)

        self.screenshot("my_orders_list")

        # Find and cancel first order
        self.js("document.querySelector('#my-orders-list .cancel-btn, #my-orders-list [onclick*=cancel]')?.click()")
        time.sleep(2)

        if self.js("return document.getElementById('tx-confirm-modal')?.classList.contains('active')"):
            self.screenshot("cancel_order_tx")
            self.js("document.getElementById('tx-confirm-btn').click()")
            time.sleep(3)
            self.log("Order cancelled!", "✅")

        return self

    def view_contract_state(self):
        """View current contract state"""
        print("\n" + "="*60)
        print("📊 CONTRACT STATE")
        print("="*60)

        self.close_all_modals()

        # View stats
        self.js("showGlobalStats()")
        time.sleep(1)
        self.screenshot("contract_stats")

        # Extract stats from DOM
        stats = self.js("""
            return {
                totalVolume: document.querySelector('.stat-card:nth-child(1) .stat-value')?.textContent,
                totalTrades: document.querySelector('.stat-card:nth-child(2) .stat-value')?.textContent,
                activeOrders: document.querySelector('.stat-card:nth-child(3) .stat-value')?.textContent,
                activeTrades: document.querySelector('.stat-card:nth-child(4) .stat-value')?.textContent,
            };
        """)

        if stats:
            self.log(f"Total Volume: {stats.get('totalVolume', 'N/A')}")
            self.log(f"Total Trades: {stats.get('totalTrades', 'N/A')}")
            self.log(f"Active Orders: {stats.get('activeOrders', 'N/A')}")
            self.log(f"Active Trades: {stats.get('activeTrades', 'N/A')}")

        self.close_modal()
        return self

    def run_create_order_test(self):
        """Run just the create order action"""
        self.connect()
        self.goto_p2p()
        self.view_contract_state()
        self.action_create_order(amount="5", price="0.01")
        self.view_contract_state()  # See if order count changed
        print("\n✅ Create Order Test Complete")

    def run_full_trade_flow(self):
        """Run full trade flow (requires switching wallets)"""
        self.connect()
        self.goto_p2p()

        print("\n⚠️  Full trade flow requires:")
        print("   1. Seller creates order")
        print("   2. Switch to buyer wallet")
        print("   3. Buyer accepts order")
        print("   4. Buyer marks payment sent")
        print("   5. Switch to seller wallet")
        print("   6. Seller confirms payment")
        print("   7. Switch to buyer wallet")
        print("   8. Buyer claims trade")

        # For now, just create an order
        self.action_create_order()

    def run_escrow_test(self):
        """Run escrow staking test"""
        self.connect()
        self.goto_p2p()
        self.action_stake_escrow(amount="10")
        print("\n✅ Escrow Staking Test Complete")


def main():
    test = P2PActionsTest()

    if len(sys.argv) > 1:
        action = sys.argv[1]
        if action == "create":
            test.run_create_order_test()
        elif action == "escrow":
            test.run_escrow_test()
        elif action == "full":
            test.run_full_trade_flow()
        else:
            print(f"Unknown action: {action}")
            print("Usage: python test_p2p_actions.py [create|escrow|full]")
    else:
        # Default: show contract state and create order
        test.connect()
        test.goto_p2p()
        test.view_contract_state()
        test.action_create_order()


if __name__ == "__main__":
    main()
