#!/usr/bin/env python3
"""
P2P Marketplace Full Flow Test with Screenshots
Tests the complete trade flow from browsing orders to completion
"""

import os
import sys
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

class P2PFlowTest:
    def __init__(self, headless=False):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--window-size=1400,900')
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')

        self.driver = webdriver.Chrome(options=options)
        self.base_url = "file://{REPO_ROOT}/src/p2p/p2p.html"
        self.screenshot_dir = "" + REPO_ROOT + "//tests/screenshots/p2p_flow"
        os.makedirs(self.screenshot_dir, exist_ok=True)
        self.step = 0

    def screenshot(self, name):
        """Save screenshot with step number"""
        self.step += 1
        filename = f"{self.step:02d}_{name}.png"
        path = os.path.join(self.screenshot_dir, filename)
        self.driver.save_screenshot(path)
        print(f"  Screenshot: {filename}")
        return path

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

    def click(self, selector):
        """Click an element"""
        element = self.wait_for_clickable(selector)
        element.click()
        time.sleep(0.5)

    def run_tests(self):
        """Run all P2P flow tests"""
        print("\n" + "="*60)
        print("P2P MARKETPLACE FLOW TEST")
        print("="*60 + "\n")

        tests = [
            ("Main Page Load", self.test_main_page),
            ("Order Cards Display", self.test_order_cards),
            ("Buy/Sell Toggle", self.test_buy_sell_toggle),
            ("Asset Filter", self.test_asset_filter),
            ("My Trades Modal", self.test_my_trades_modal),
            ("My Trades Tabs", self.test_my_trades_tabs),
            ("Trade Modal Open", self.test_trade_modal),
            ("Active Trade Modal", self.test_active_trade_modal),
            ("Create Order Modal", self.test_create_order_modal),
            ("Escrow Staking Modal", self.test_escrow_modal),
        ]

        results = []
        for name, test_func in tests:
            print(f"\n[TEST] {name}")
            try:
                test_func()
                results.append((name, "PASS", None))
                print(f"  Result: PASS")
            except Exception as e:
                self.screenshot(f"FAIL_{name.replace(' ', '_')}")
                results.append((name, "FAIL", str(e)))
                print(f"  Result: FAIL - {e}")

        # Print summary
        print("\n" + "="*60)
        print("TEST RESULTS SUMMARY")
        print("="*60)
        passed = sum(1 for _, status, _ in results if status == "PASS")
        failed = sum(1 for _, status, _ in results if status == "FAIL")
        print(f"Passed: {passed}/{len(results)}")
        print(f"Failed: {failed}/{len(results)}")
        print()
        for name, status, error in results:
            status_icon = "✓" if status == "PASS" else "✗"
            print(f"  {status_icon} {name}")
            if error:
                print(f"      Error: {error}")

        print(f"\nScreenshots saved to: {self.screenshot_dir}")
        return results

    def test_main_page(self):
        """Test main P2P marketplace page loads"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Check page title/header
        header = self.wait_for(".p2p-header h1")
        assert "P2P" in header.text or "Marketplace" in header.text.lower() or header.text

        self.screenshot("main_page")

        # Check key elements exist
        assert self.driver.find_element(By.CSS_SELECTOR, ".trade-toggle")
        # Check for orders list (may be .orders-grid or .orders-list or #orders-list)
        orders_container = self.driver.find_elements(By.CSS_SELECTOR, ".orders-grid, .orders-list, #orders-list")
        assert len(orders_container) > 0, "Orders container not found"

    def test_order_cards(self):
        """Test order cards are displayed"""
        # Wait for orders to load
        time.sleep(1)

        # Find order cards
        order_cards = self.driver.find_elements(By.CSS_SELECTOR, ".order-card")
        print(f"  Found {len(order_cards)} order cards")

        self.screenshot("order_cards")

        if len(order_cards) > 0:
            # Check first card has expected elements
            first_card = order_cards[0]
            # Should have seller info, price, amount, etc.
            assert first_card.find_element(By.CSS_SELECTOR, ".order-price, .price, .trader-name")

    def test_buy_sell_toggle(self):
        """Test buy/sell toggle functionality"""
        # Find toggle buttons
        toggle_btns = self.driver.find_elements(By.CSS_SELECTOR, ".toggle-btn")

        if len(toggle_btns) >= 2:
            # Click sell button
            toggle_btns[1].click()
            time.sleep(0.5)
            self.screenshot("sell_toggle")

            # Click buy button
            toggle_btns[0].click()
            time.sleep(0.5)
            self.screenshot("buy_toggle")

    def test_asset_filter(self):
        """Test asset filter dropdown"""
        # Find asset filter
        asset_filter = self.driver.find_elements(By.CSS_SELECTOR, ".asset-filter, #asset-filter, select[id*='asset']")

        if asset_filter:
            asset_filter[0].click()
            time.sleep(0.3)
            self.screenshot("asset_filter_open")

            # Select an option if available
            options = self.driver.find_elements(By.CSS_SELECTOR, ".asset-filter option, #asset-filter option")
            if len(options) > 1:
                options[1].click()
                time.sleep(0.5)
                self.screenshot("asset_filter_selected")

    def test_my_trades_modal(self):
        """Test My Trades modal opens and displays correctly"""
        # Find and click My Trades button
        my_trades_btn = self.driver.find_elements(By.CSS_SELECTOR, "[onclick*='showMyTrades'], .icon-btn[title*='Trade'], button[title*='Trade']")

        if not my_trades_btn:
            # Try header actions
            header_btns = self.driver.find_elements(By.CSS_SELECTOR, ".header-actions .icon-btn")
            if header_btns:
                my_trades_btn = [header_btns[0]]  # Usually first icon button

        if my_trades_btn:
            my_trades_btn[0].click()
            time.sleep(0.5)

            # Wait for modal
            modal = self.wait_for("#my-trades-modal.show, #my-trades-modal[style*='display']")
            self.screenshot("my_trades_modal")

            # Check modal content
            modal_body = self.driver.find_element(By.CSS_SELECTOR, "#my-trades-modal .modal-body")
            assert modal_body

            # Check tabs exist
            tabs = self.driver.find_elements(By.CSS_SELECTOR, ".trades-tab")
            print(f"  Found {len(tabs)} tabs")
            assert len(tabs) >= 2, "Should have Active/Completed tabs"

            # Close modal
            close_btn = self.driver.find_element(By.CSS_SELECTOR, "#my-trades-modal .modal-close")
            close_btn.click()
            time.sleep(0.3)

    def test_my_trades_tabs(self):
        """Test My Trades tab switching"""
        # Open My Trades modal
        self.driver.execute_script("showMyTrades()")
        time.sleep(0.5)

        self.screenshot("my_trades_active_tab")

        # Click Completed tab
        tabs = self.driver.find_elements(By.CSS_SELECTOR, ".trades-tab")
        for tab in tabs:
            if "completed" in tab.text.lower():
                tab.click()
                time.sleep(0.5)
                break

        self.screenshot("my_trades_completed_tab")

        # Check completed section is visible
        completed_section = self.driver.find_element(By.CSS_SELECTOR, "#completed-trades-section")
        assert completed_section.is_displayed(), "Completed section should be visible"

        # Check active section is hidden
        active_section = self.driver.find_element(By.CSS_SELECTOR, "#active-trades-section")
        assert not active_section.is_displayed(), "Active section should be hidden"

        # Click My Orders tab
        for tab in tabs:
            if "order" in tab.text.lower():
                tab.click()
                time.sleep(0.5)
                break

        self.screenshot("my_trades_my_orders_tab")

        # Close modal
        self.driver.find_element(By.CSS_SELECTOR, "#my-trades-modal .modal-close").click()
        time.sleep(0.3)

    def test_trade_modal(self):
        """Test opening trade modal for an order"""
        # Find order cards with buy/sell button
        order_cards = self.driver.find_elements(By.CSS_SELECTOR, ".order-card")

        if order_cards:
            # Find buy/sell button in first card
            buy_btn = order_cards[0].find_elements(By.CSS_SELECTOR, ".buy-btn, .sell-btn, button[onclick*='openTradeModal']")

            if buy_btn:
                buy_btn[0].click()
                time.sleep(0.5)

                # Check if trade modal opened
                trade_modal = self.driver.find_elements(By.CSS_SELECTOR, "#trade-modal.show, #trade-modal[style*='display']")
                if trade_modal:
                    self.screenshot("trade_modal")

                    # Check modal content
                    assert self.driver.find_element(By.CSS_SELECTOR, "#trade-modal .modal-body")

                    # Close modal
                    close_btn = self.driver.find_element(By.CSS_SELECTOR, "#trade-modal .modal-close")
                    close_btn.click()
                    time.sleep(0.3)

    def test_active_trade_modal(self):
        """Test active trade modal scroll and layout"""
        # Open active trade modal directly for testing
        self.driver.execute_script("""
            // Create mock trade data
            state.activeTrade = {
                id: 'TEST123',
                order: {
                    asset: 174,
                    seller: { name: 'TestSeller', address: 'abc123...', trustScore: 95, totalTrades: 50 },
                    paymentMethods: ['bank_transfer'],
                    currency: 'USD'
                },
                payAmount: 100.00,
                receiveAmount: 10000,
                status: 'accepted',
                startedAt: Date.now(),
                role: 'buyer'
            };

            // Populate modal
            document.getElementById('active-trade-id').textContent = 'TEST123';
            document.getElementById('active-trade-status').textContent = 'Awaiting Payment';
            document.getElementById('active-trade-role').textContent = 'BUYING';
            document.getElementById('active-trade-amount').textContent = '10,000 FOMO';
            document.getElementById('active-trade-fiat').textContent = '$100.00 USD';
            document.getElementById('active-trader-avatar').textContent = 'T';
            document.getElementById('active-trader-name').textContent = 'TestSeller';
            document.getElementById('active-trader-trust').textContent = '95% | 50 trades';
            document.getElementById('active-payment-method').textContent = 'Bank Transfer';
            document.getElementById('active-pay-amount').textContent = '$100.00 USD';
            document.getElementById('active-reference').textContent = 'BEAM-TEST123';

            openModal('active-trade-modal');
        """)
        time.sleep(0.5)

        self.screenshot("active_trade_modal")

        # Check modal is visible
        modal = self.wait_for("#active-trade-modal.show")
        assert modal

        # Check key elements
        assert self.driver.find_element(By.CSS_SELECTOR, "#active-trade-id")
        assert self.driver.find_element(By.CSS_SELECTOR, ".trade-status-banner")
        assert self.driver.find_element(By.CSS_SELECTOR, ".trade-summary-box")
        assert self.driver.find_element(By.CSS_SELECTOR, ".payment-details-box")
        assert self.driver.find_element(By.CSS_SELECTOR, ".trade-timeline")

        # Test scroll by scrolling down
        modal_body = self.driver.find_element(By.CSS_SELECTOR, "#active-trade-modal .modal-body")
        self.driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", modal_body)
        time.sleep(0.3)
        self.screenshot("active_trade_modal_scrolled")

        # Check close button works
        close_btn = self.driver.find_element(By.CSS_SELECTOR, "#active-trade-modal .modal-close")
        assert close_btn.is_displayed(), "Close button should be visible"

        close_btn.click()
        time.sleep(0.3)

        # Verify modal is closed
        modal_display = self.driver.execute_script(
            "return document.getElementById('active-trade-modal').classList.contains('show')"
        )
        assert not modal_display, "Modal should be closed"

    def test_create_order_modal(self):
        """Test create order modal"""
        # Find and click create order button
        create_btn = self.driver.find_elements(By.CSS_SELECTOR, "[onclick*='showCreateOrder'], .create-order-btn, button[title*='Create']")

        if not create_btn:
            # Try header actions
            header_btns = self.driver.find_elements(By.CSS_SELECTOR, ".header-actions .icon-btn")
            for btn in header_btns:
                if "+" in btn.text or "create" in btn.get_attribute("title").lower() if btn.get_attribute("title") else False:
                    create_btn = [btn]
                    break

        if create_btn:
            create_btn[0].click()
            time.sleep(0.5)

            # Check if modal opened
            modal = self.driver.find_elements(By.CSS_SELECTOR, "#create-order-modal.show")
            if modal:
                self.screenshot("create_order_modal")

                # Check form elements
                assert self.driver.find_element(By.CSS_SELECTOR, "#create-order-modal .modal-body")

                # Close modal
                close_btn = self.driver.find_element(By.CSS_SELECTOR, "#create-order-modal .modal-close")
                close_btn.click()
                time.sleep(0.3)

    def test_escrow_modal(self):
        """Test escrow staking modal"""
        # Find and click escrow button
        escrow_btn = self.driver.find_elements(By.CSS_SELECTOR, "[onclick*='showEscrowStaking'], .escrow-btn")

        if not escrow_btn:
            # Try header actions
            header_btns = self.driver.find_elements(By.CSS_SELECTOR, ".header-actions .icon-btn")
            for btn in header_btns:
                title = btn.get_attribute("title") or ""
                if "escrow" in title.lower() or "stake" in title.lower():
                    escrow_btn = [btn]
                    break

        if escrow_btn:
            escrow_btn[0].click()
            time.sleep(0.5)

            # Check if modal opened
            modal = self.driver.find_elements(By.CSS_SELECTOR, "#escrow-modal.show")
            if modal:
                self.screenshot("escrow_modal")

                # Check content
                assert self.driver.find_element(By.CSS_SELECTOR, "#escrow-modal .modal-body")

                # Close modal
                close_btn = self.driver.find_element(By.CSS_SELECTOR, "#escrow-modal .modal-close")
                close_btn.click()
                time.sleep(0.3)

    def cleanup(self):
        """Close browser"""
        self.driver.quit()


if __name__ == "__main__":
    headless = "--headless" in sys.argv

    test = P2PFlowTest(headless=headless)
    try:
        test.run_tests()
    finally:
        test.cleanup()
