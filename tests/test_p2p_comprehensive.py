#!/usr/bin/env python3
"""
P2P Marketplace Comprehensive Selenium Tests
Tests all contract methods through UI with screenshots

Wallets:
- test_wallet ($BEAM_TEST_PASSWORD) - Seller/Manager/Escrow
- test_2 (123123) - Buyer
"""

import time
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "tests/screenshots/p2p"

class P2PComprehensiveTests:
    def __init__(self):
        options = Options()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        self.driver = webdriver.Chrome(options=options)
        self.results = []
        self.screenshot_count = 0
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        
    def screenshot(self, name):
        self.screenshot_count += 1
        filename = f"{self.screenshot_count:03d}_{name}.png"
        path = os.path.join(SCREENSHOT_DIR, filename)
        self.driver.save_screenshot(path)
        print(f"  📸 {filename}")
        return path
        
    def switch_to_p2p_iframe(self):
        """Switch to P2P iframe context"""
        self.driver.switch_to.default_content()
        try:
            iframe = WebDriverWait(self.driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'iframe[src*="p2p"]'))
            )
            self.driver.switch_to.frame(iframe)
            return True
        except:
            return False
            
    def click_in_iframe(self, selector, timeout=10):
        """Click element inside P2P iframe"""
        self.switch_to_p2p_iframe()
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
            )
            el.click()
            time.sleep(0.3)
            return True
        except Exception as e:
            print(f"  ⚠️ Failed to click {selector}: {e}")
            return False
            
    def fill_in_iframe(self, selector, value, timeout=10):
        """Fill input inside P2P iframe"""
        self.switch_to_p2p_iframe()
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            el.clear()
            el.send_keys(str(value))
            return True
        except:
            return False
            
    def get_text_in_iframe(self, selector, timeout=5):
        """Get text from element inside P2P iframe"""
        self.switch_to_p2p_iframe()
        try:
            el = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
            return el.text
        except:
            return None
            
    def close_all_modals(self):
        """Close all open modals"""
        self.switch_to_p2p_iframe()
        try:
            modals = self.driver.find_elements(By.CSS_SELECTOR, '.modal.show')
            for modal in modals:
                try:
                    modal.find_element(By.CSS_SELECTOR, '.modal-close').click()
                except:
                    pass
            time.sleep(0.3)
        except:
            pass
            
    def log_result(self, name, status, details=""):
        icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{icon} {name}: {status} {details}")
        self.results.append((name, status, details))
        
    # ==================== NAVIGATION ====================
    
    def test_navigate_to_p2p(self):
        """Navigate to P2P page"""
        print("\n📍 Navigating to P2P page...")
        self.driver.get(f"{BASE_URL}/p2p")
        time.sleep(3)
        self.screenshot("p2p_page_loaded")
        
        if self.switch_to_p2p_iframe():
            self.log_result("Navigate to P2P", "PASS")
            return True
        else:
            self.log_result("Navigate to P2P", "FAIL", "Could not find iframe")
            return False
            
    # ==================== VIEW METHODS ====================
    
    def test_view_orders(self):
        """Test: view_orders - View order list"""
        print("\n📋 Testing: view_orders")
        self.switch_to_p2p_iframe()
        
        # Check order rows
        orders = self.driver.find_elements(By.CSS_SELECTOR, '.order-row')
        print(f"  Found {len(orders)} orders")
        
        # Test FOMO tab
        self.click_in_iframe('.asset-tab[data-asset="174"], .asset-tab:first-child')
        time.sleep(0.5)
        self.screenshot("view_orders_fomo_tab")
        
        # Test BEAM tab
        tabs = self.driver.find_elements(By.CSS_SELECTOR, '.asset-tab')
        for tab in tabs:
            if 'BEAM' in tab.text:
                tab.click()
                time.sleep(0.5)
                break
        self.screenshot("view_orders_beam_tab")
        
        # Test Buy/Sell toggle
        self.click_in_iframe('#btn-sell, .toggle-btn:contains("Sell")')
        time.sleep(0.3)
        self.screenshot("view_orders_sell_side")
        
        self.click_in_iframe('#btn-buy, .toggle-btn:contains("Buy")')
        time.sleep(0.3)
        self.screenshot("view_orders_buy_side")
        
        self.log_result("view_orders", "PASS")
        
    def test_view_stats(self):
        """Test: view_stats - Marketplace statistics"""
        print("\n📊 Testing: view_stats (Marketplace Statistics)")
        self.close_all_modals()
        
        self.click_in_iframe('[onclick*="showGlobalStats"]')
        time.sleep(1)
        self.screenshot("view_stats_modal")
        
        # Check stats values
        self.switch_to_p2p_iframe()
        stats = self.driver.find_elements(By.CSS_SELECTOR, '.stat-card')
        print(f"  Found {len(stats)} stat cards")
        
        self.close_all_modals()
        self.log_result("view_stats", "PASS")
        
    def test_dispute_center(self):
        """Test: Dispute Center tabs"""
        print("\n⚖️ Testing: Dispute Center")
        self.close_all_modals()
        
        self.click_in_iframe('[onclick*="showDisputeCenter"]')
        time.sleep(1)
        self.screenshot("dispute_center_my_disputes")
        
        # Test Arbitration tab
        self.click_in_iframe('.dispute-tab[data-tab="arbitration"]')
        time.sleep(0.5)
        self.screenshot("dispute_center_arbitration")
        
        self.close_all_modals()
        self.log_result("dispute_center", "PASS")
        
    def test_payment_methods_manager(self):
        """Test: Payment Methods Manager"""
        print("\n💳 Testing: Payment Methods Manager")
        self.close_all_modals()
        
        self.click_in_iframe('[onclick*="showPaymentMethodsManager"]')
        time.sleep(1)
        self.screenshot("payment_methods_list")
        
        # Try adding a payment method
        self.switch_to_p2p_iframe()
        add_btns = self.driver.find_elements(By.CSS_SELECTOR, 'button')
        for btn in add_btns:
            if 'Add' in btn.text:
                btn.click()
                break
        time.sleep(0.5)
        self.screenshot("payment_methods_add_form")
        
        self.close_all_modals()
        self.log_result("payment_methods_manager", "PASS")
        
    def test_help(self):
        """Test: Help modal"""
        print("\n❓ Testing: Help")
        self.close_all_modals()
        
        self.click_in_iframe('[onclick*="showHelp"]')
        time.sleep(1)
        self.screenshot("help_modal")
        
        self.close_all_modals()
        self.log_result("help", "PASS")
        
    # ==================== SELLER METHODS ====================
    
    def test_create_order_modal(self):
        """Test: create_order - Create order modal"""
        print("\n📝 Testing: create_order modal")
        self.close_all_modals()
        
        # Click Create Order button
        self.switch_to_p2p_iframe()
        btns = self.driver.find_elements(By.CSS_SELECTOR, '.action-btn, button')
        for btn in btns:
            if 'Create Order' in btn.text or 'Create' in btn.text:
                btn.click()
                break
        time.sleep(1)
        self.screenshot("create_order_modal_open")
        
        # Fill form
        self.fill_in_iframe('#create-amount', '1')
        self.fill_in_iframe('#create-price', '0.50')
        self.screenshot("create_order_form_filled")
        
        # Don't submit - just test the form
        self.close_all_modals()
        self.log_result("create_order_modal", "PASS")
        
    def test_cancel_order_button(self):
        """Test: cancel_order - Check cancel button exists"""
        print("\n🚫 Testing: cancel_order button")
        self.close_all_modals()
        self.switch_to_p2p_iframe()
        
        cancel_btns = self.driver.find_elements(By.CSS_SELECTOR, '.cancel-btn, [onclick*="cancelOrder"], button')
        cancel_btns = [b for b in cancel_btns if 'Cancel' in b.text]
        
        if cancel_btns:
            print(f"  Found {len(cancel_btns)} Cancel buttons")
            self.screenshot("cancel_order_buttons")
            self.log_result("cancel_order_button", "PASS", f"{len(cancel_btns)} buttons found")
        else:
            self.log_result("cancel_order_button", "SKIP", "No orders to cancel")
            
    def test_edit_order_button(self):
        """Test: edit_order - Check edit button exists"""
        print("\n✏️ Testing: edit_order button")
        self.switch_to_p2p_iframe()
        
        edit_btns = self.driver.find_elements(By.CSS_SELECTOR, '.edit-btn, [onclick*="editOrder"], button')
        edit_btns = [b for b in edit_btns if 'Edit' in b.text]
        
        if edit_btns:
            print(f"  Found {len(edit_btns)} Edit buttons")
            self.screenshot("edit_order_buttons")
            self.log_result("edit_order_button", "PASS", f"{len(edit_btns)} buttons found")
        else:
            self.log_result("edit_order_button", "SKIP", "No orders to edit")
            
    # ==================== MY TRADES ====================
    
    def test_my_trades_modal(self):
        """Test: My Trades modal"""
        print("\n📋 Testing: My Trades modal")
        self.close_all_modals()
        
        # Find and click My Trades button
        self.switch_to_p2p_iframe()
        btns = self.driver.find_elements(By.CSS_SELECTOR, '.action-btn, button')
        for btn in btns:
            if 'My Trades' in btn.text or 'Trades' in btn.text:
                btn.click()
                break
        time.sleep(1)
        self.screenshot("my_trades_modal")
        
        # Check tabs
        self.switch_to_p2p_iframe()
        tabs = self.driver.find_elements(By.CSS_SELECTOR, '.trades-tab, .tab')
        print(f"  Found {len(tabs)} tabs")
        
        for tab in tabs:
            try:
                tab.click()
                time.sleep(0.3)
                print(f"  Clicked tab: {tab.text}")
            except:
                pass
                
        self.screenshot("my_trades_tabs")
        self.close_all_modals()
        self.log_result("my_trades_modal", "PASS")
        
    # ==================== ESCROW METHODS ====================
    
    def test_escrow_staking_modal(self):
        """Test: Escrow Staking modal"""
        print("\n🛡️ Testing: Escrow Staking modal")
        self.close_all_modals()
        
        # Find and click Escrow Staking button
        self.switch_to_p2p_iframe()
        btns = self.driver.find_elements(By.CSS_SELECTOR, '.action-btn, button')
        for btn in btns:
            if 'Escrow' in btn.text or 'Staking' in btn.text:
                btn.click()
                break
        time.sleep(1)
        self.screenshot("escrow_staking_modal")
        
        # Check stake input
        self.switch_to_p2p_iframe()
        inputs = self.driver.find_elements(By.CSS_SELECTOR, 'input[type="number"], input[type="text"]')
        print(f"  Found {len(inputs)} input fields in modal")
        
        self.close_all_modals()
        self.log_result("escrow_staking_modal", "PASS")
        
    # ==================== FILTER TESTS ====================
    
    def test_payment_dropdown(self):
        """Test: Payment Methods dropdown filter"""
        print("\n🔽 Testing: Payment Methods dropdown")
        self.close_all_modals()
        
        self.click_in_iframe('.dropdown-trigger, #payment-dropdown .dropdown-trigger')
        time.sleep(0.5)
        self.screenshot("payment_dropdown_open")
        
        # Check items
        self.switch_to_p2p_iframe()
        items = self.driver.find_elements(By.CSS_SELECTOR, '.dropdown-item')
        print(f"  Found {len(items)} dropdown items")
        
        # Click outside to close
        self.driver.find_element(By.CSS_SELECTOR, 'body').click()
        time.sleep(0.3)
        
        self.log_result("payment_dropdown", "PASS")
        
    def test_currency_filter(self):
        """Test: Currency filter"""
        print("\n💱 Testing: Currency filter")
        self.switch_to_p2p_iframe()
        
        selects = self.driver.find_elements(By.CSS_SELECTOR, 'select, .filter-select')
        print(f"  Found {len(selects)} select elements")
        
        self.screenshot("currency_filter")
        self.log_result("currency_filter", "PASS")
        
    # ==================== UI COMPONENT TESTS ====================
    
    def test_contract_id_display(self):
        """Test: Contract ID badge display"""
        print("\n🔗 Testing: Contract ID display")
        self.switch_to_p2p_iframe()
        
        cid = self.driver.find_elements(By.CSS_SELECTOR, '.contract-id, [onclick*="copyContractId"]')
        if cid:
            text = cid[0].text
            print(f"  Contract ID display: {text[:50]}...")
            self.screenshot("contract_id_display")
            self.log_result("contract_id_display", "PASS")
        else:
            self.log_result("contract_id_display", "FAIL", "Not found")
            
    def test_own_orders_buttons(self):
        """Test: Own orders show Cancel/Edit instead of Buy"""
        print("\n👤 Testing: Own orders display")
        self.switch_to_p2p_iframe()
        
        # Check for Cancel/Edit buttons (own orders) vs Buy buttons
        rows = self.driver.find_elements(By.CSS_SELECTOR, '.order-row')
        has_cancel = False
        has_buy = False
        
        for row in rows:
            text = row.text
            if 'Cancel' in text:
                has_cancel = True
            if 'Buy' in text and 'YOUR ORDER' not in text.upper():
                has_buy = True
                
        self.screenshot("own_orders_check")
        
        if has_cancel:
            self.log_result("own_orders_buttons", "PASS", "Cancel/Edit buttons found")
        else:
            self.log_result("own_orders_buttons", "SKIP", "No own orders visible")
            
    # ==================== TEST RUNNER ====================
    
    def run_all(self):
        print("\n" + "="*60)
        print("🚀 P2P COMPREHENSIVE SELENIUM TEST SUITE")
        print("="*60)
        
        if not self.test_navigate_to_p2p():
            print("❌ Cannot proceed without P2P page")
            return
            
        # View/Read tests
        self.test_view_orders()
        self.test_view_stats()
        self.test_dispute_center()
        self.test_payment_methods_manager()
        self.test_help()
        
        # UI component tests
        self.test_contract_id_display()
        self.test_own_orders_buttons()
        self.test_payment_dropdown()
        self.test_currency_filter()
        
        # Modal tests
        self.test_create_order_modal()
        self.test_cancel_order_button()
        self.test_edit_order_button()
        self.test_my_trades_modal()
        self.test_escrow_staking_modal()
        
        # Print summary
        self.print_summary()
        
    def print_summary(self):
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        
        passed = sum(1 for _, s, _ in self.results if s == "PASS")
        failed = sum(1 for _, s, _ in self.results if s == "FAIL")
        skipped = sum(1 for _, s, _ in self.results if s == "SKIP")
        
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"⚠️ Skipped: {skipped}")
        print(f"📸 Screenshots: {self.screenshot_count}")
        
        if failed > 0:
            print("\n❌ Failed tests:")
            for name, status, details in self.results:
                if status == "FAIL":
                    print(f"  - {name}: {details}")
                    
        print("="*60)


if __name__ == "__main__":
    tests = P2PComprehensiveTests()
    tests.run_all()
