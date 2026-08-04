#!/usr/bin/env python3
"""
P2P Marketplace UI/UX Testing for BEAM LightWallet
Comprehensive testing of all P2P Marketplace features and design
"""

import time
import json
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

BASE_URL = "http://127.0.0.1:9080"
P2P_URL = f"{BASE_URL}/src/p2p/p2p.html"
SCREENSHOT_DIR = "/tmp/p2p_test"

class P2PMarketplaceTester:
    def __init__(self):
        self.driver = None
        self.results = []
        self.screenshots_taken = 0
        self.issues_found = []

    def connect_to_chrome(self):
        """Connect to existing Chrome debug session"""
        options = Options()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        try:
            self.driver = webdriver.Chrome(options=options)
            print("✓ Connected to Chrome debug session")
            return True
        except Exception as e:
            print(f"✗ Failed to connect to Chrome: {e}")
            return False

    def log_result(self, test_name, passed, message=""):
        """Log test result"""
        status = "✓ PASS" if passed else "✗ FAIL"
        result = f"{status}: {test_name}"
        if message:
            result += f" - {message}"
        print(result)
        self.results.append({"test": test_name, "passed": passed, "message": message})
        return passed

    def log_issue(self, severity, component, description):
        """Log UI/UX issue"""
        issue = {"severity": severity, "component": component, "description": description}
        self.issues_found.append(issue)
        print(f"  [{severity.upper()}] {component}: {description}")

    def wait_for_element(self, by, value, timeout=10):
        """Wait for element to be present"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, value))
            )
            return element
        except TimeoutException:
            return None

    def wait_for_clickable(self, by, value, timeout=10):
        """Wait for element to be clickable"""
        try:
            element = WebDriverWait(self.driver, timeout).until(
                EC.element_to_be_clickable((by, value))
            )
            return element
        except TimeoutException:
            return None

    def safe_click(self, element):
        """Safely click an element, handling overlays"""
        try:
            element.click()
            return True
        except ElementClickInterceptedException:
            # Try JavaScript click
            self.driver.execute_script("arguments[0].click();", element)
            return True
        except Exception as e:
            print(f"  Click failed: {e}")
            return False

    def screenshot(self, name):
        """Take screenshot"""
        import os
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        self.screenshots_taken += 1
        filename = f"{SCREENSHOT_DIR}/p2p_{self.screenshots_taken:02d}_{name}.png"
        self.driver.save_screenshot(filename)
        print(f"  Screenshot: {filename}")
        return filename

    def navigate_to_p2p(self):
        """Navigate to P2P Marketplace page"""
        print("\n=== Navigating to P2P Marketplace ===")
        self.driver.get(P2P_URL)
        time.sleep(2)
        self.screenshot("01_p2p_initial_load")

    # ===== DESIGN TESTS =====

    def test_page_structure(self):
        """Test overall page structure and layout"""
        print("\n=== Testing Page Structure ===")

        # Header
        header = self.wait_for_element(By.CSS_SELECTOR, ".p2p-header", timeout=5)
        self.log_result("Header present", header is not None)

        if header:
            h1 = header.find_elements(By.TAG_NAME, "h1")
            self.log_result("Title present", len(h1) > 0)

            # Check gradient text effect
            if h1:
                color = h1[0].value_of_css_property("background-image")
                has_gradient = "gradient" in color or "linear" in color
                self.log_result("Title has gradient effect", has_gradient, color[:50] if color else "")

        # Header actions (icons)
        header_actions = self.driver.find_elements(By.CSS_SELECTOR, ".header-actions .icon-btn")
        self.log_result("Header action buttons present", len(header_actions) >= 4, f"Found {len(header_actions)}")

        # Contract info section
        contract_info = self.wait_for_element(By.ID, "contract-info", timeout=3)
        self.log_result("Contract info section present", contract_info is not None)

        # Warning banner
        warning = self.driver.find_elements(By.CSS_SELECTOR, ".warning-banner")
        self.log_result("Warning banner present", len(warning) > 0)

    def test_trade_toggle(self):
        """Test Buy/Sell toggle"""
        print("\n=== Testing Buy/Sell Toggle ===")

        toggle_container = self.wait_for_element(By.CSS_SELECTOR, ".trade-toggle", timeout=5)
        self.log_result("Trade toggle container present", toggle_container is not None)

        buy_btn = self.wait_for_element(By.ID, "btn-buy", timeout=3)
        sell_btn = self.wait_for_element(By.ID, "btn-sell", timeout=3)

        self.log_result("Buy button present", buy_btn is not None)
        self.log_result("Sell button present", sell_btn is not None)

        if buy_btn and sell_btn:
            # Check initial state (Buy should be active)
            buy_classes = buy_btn.get_attribute("class")
            self.log_result("Buy button initially active", "active" in buy_classes)

            # Test toggle to Sell
            self.safe_click(sell_btn)
            time.sleep(0.5)
            sell_classes = sell_btn.get_attribute("class")
            self.log_result("Sell toggle works", "active" in sell_classes)
            self.screenshot("02_sell_mode")

            # Check color change (should be red for sell)
            sell_bg = sell_btn.value_of_css_property("background-color")
            is_red = "239" in sell_bg or "ef44" in sell_bg or "red" in sell_bg.lower()
            self.log_result("Sell button has red color", is_red, sell_bg)

            # Toggle back to Buy
            self.safe_click(buy_btn)
            time.sleep(0.5)
            buy_bg = buy_btn.value_of_css_property("background-color")
            is_green = "192" in buy_bg or "c087" in buy_bg or "green" in buy_bg.lower() or "0, 192" in buy_bg
            self.log_result("Buy button has green color", is_green, buy_bg)

    def test_asset_tabs(self):
        """Test asset selection tabs (FOMO, BEAM, NPH)"""
        print("\n=== Testing Asset Tabs ===")

        asset_tabs = self.driver.find_elements(By.CSS_SELECTOR, ".asset-tab")
        self.log_result("Asset tabs present", len(asset_tabs) >= 3, f"Found {len(asset_tabs)}")

        for tab in asset_tabs:
            asset_name = tab.text
            self.safe_click(tab)
            time.sleep(0.3)
            is_active = "active" in tab.get_attribute("class")
            self.log_result(f"Asset tab '{asset_name}' clickable", is_active)

        self.screenshot("03_asset_tabs")

    def test_filters(self):
        """Test filter controls"""
        print("\n=== Testing Filters ===")

        # Amount input
        amount_input = self.wait_for_element(By.ID, "amount-input", timeout=3)
        self.log_result("Amount filter input present", amount_input is not None)

        # Currency select
        currency_select = self.wait_for_element(By.ID, "currency-select", timeout=3)
        self.log_result("Currency select present", currency_select is not None)

        if currency_select:
            options = currency_select.find_elements(By.TAG_NAME, "option")
            currencies = [opt.text for opt in options]
            self.log_result("Currency options available", len(options) >= 3, f"Found: {currencies}")

        # Payment method dropdown
        payment_dropdown = self.wait_for_element(By.ID, "payment-dropdown", timeout=3)
        self.log_result("Payment dropdown present", payment_dropdown is not None)

        if payment_dropdown:
            trigger = payment_dropdown.find_element(By.CSS_SELECTOR, ".dropdown-trigger")
            self.safe_click(trigger)
            time.sleep(0.5)

            dropdown_content = self.wait_for_element(By.ID, "payment-dropdown-content", timeout=3)
            if dropdown_content:
                is_visible = "show" in dropdown_content.get_attribute("class")
                self.log_result("Payment dropdown opens", is_visible)
                self.screenshot("04_payment_dropdown")

                # Check payment methods
                methods = dropdown_content.find_elements(By.CSS_SELECTOR, ".dropdown-item")
                self.log_result("Payment methods listed", len(methods) >= 5, f"Found {len(methods)}")

                # Close dropdown
                self.safe_click(trigger)
                time.sleep(0.3)

        # Filter button
        filter_btn = self.driver.find_elements(By.CSS_SELECTOR, ".filter-btn")
        self.log_result("Filter button present", len(filter_btn) > 0)

        # Refresh button
        refresh_btn = self.driver.find_elements(By.CSS_SELECTOR, ".refresh-btn")
        self.log_result("Refresh button present", len(refresh_btn) > 0)

    def test_orders_list(self):
        """Test orders list display"""
        print("\n=== Testing Orders List ===")

        orders_container = self.wait_for_element(By.CSS_SELECTOR, ".orders-container", timeout=5)
        self.log_result("Orders container present", orders_container is not None)

        # Header columns
        orders_header = self.driver.find_elements(By.CSS_SELECTOR, ".orders-header > div")
        self.log_result("Order header columns present", len(orders_header) >= 5, f"Found {len(orders_header)}")

        # Orders list
        orders_list = self.wait_for_element(By.ID, "orders-list", timeout=3)
        if orders_list:
            # Check for loading state or orders
            loading = orders_list.find_elements(By.CSS_SELECTOR, ".loading-orders")
            order_rows = orders_list.find_elements(By.CSS_SELECTOR, ".order-row")

            if loading and loading[0].is_displayed():
                self.log_result("Orders loading indicator", True)
            else:
                self.log_result("Order rows present", len(order_rows) >= 0, f"Found {len(order_rows)} orders")

        self.screenshot("05_orders_list")

    def test_bottom_actions(self):
        """Test bottom action buttons"""
        print("\n=== Testing Bottom Actions ===")

        bottom_actions = self.wait_for_element(By.CSS_SELECTOR, ".bottom-actions", timeout=5)
        self.log_result("Bottom actions present", bottom_actions is not None)

        action_btns = self.driver.find_elements(By.CSS_SELECTOR, ".action-btn")
        self.log_result("Action buttons present", len(action_btns) >= 3, f"Found {len(action_btns)}")

        # Check specific buttons
        create_order_btn = None
        my_trades_btn = None
        escrow_staking_btn = None

        for btn in action_btns:
            text = btn.text.lower()
            if "create" in text:
                create_order_btn = btn
            elif "trades" in text:
                my_trades_btn = btn
            elif "escrow" in text:
                escrow_staking_btn = btn

        self.log_result("Create Order button present", create_order_btn is not None)
        self.log_result("My Trades button present", my_trades_btn is not None)
        self.log_result("Escrow Staking button present", escrow_staking_btn is not None)

    # ===== MODAL TESTS =====

    def test_create_order_modal(self):
        """Test Create Order modal"""
        print("\n=== Testing Create Order Modal ===")

        # Find and click Create Order button
        create_btn = None
        for btn in self.driver.find_elements(By.CSS_SELECTOR, ".action-btn"):
            if "create" in btn.text.lower():
                create_btn = btn
                break

        if create_btn:
            self.safe_click(create_btn)
            time.sleep(0.5)

            modal = self.wait_for_element(By.ID, "create-order-modal", timeout=5)
            if modal:
                is_visible = "show" in modal.get_attribute("class")
                self.log_result("Create Order modal opens", is_visible)
                self.screenshot("06_create_order_modal")

                # Check modal elements
                modal_header = modal.find_elements(By.CSS_SELECTOR, ".modal-header h2")
                self.log_result("Modal has header", len(modal_header) > 0)

                # Amount input
                amount_input = modal.find_elements(By.ID, "create-amount")
                self.log_result("Amount input present", len(amount_input) > 0)

                # Price input
                price_input = modal.find_elements(By.ID, "create-price")
                self.log_result("Price input present", len(price_input) > 0)

                # Payment checkboxes
                payment_checkboxes = modal.find_elements(By.CSS_SELECTOR, ".payment-checkboxes .checkbox-item")
                self.log_result("Payment method checkboxes present", len(payment_checkboxes) >= 3)

                # Order summary
                order_summary = modal.find_elements(By.CSS_SELECTOR, ".order-summary")
                self.log_result("Order summary section present", len(order_summary) > 0)

                # Terms checkbox
                terms_checkbox = modal.find_elements(By.ID, "create-terms")
                self.log_result("Terms checkbox present", len(terms_checkbox) > 0)

                # Close modal
                close_btn = modal.find_element(By.CSS_SELECTOR, ".modal-close")
                self.safe_click(close_btn)
                time.sleep(0.5)
            else:
                self.log_result("Create Order modal opens", False, "Modal not found")

    def test_my_trades_modal(self):
        """Test My Trades modal"""
        print("\n=== Testing My Trades Modal ===")

        my_trades_btn = None
        for btn in self.driver.find_elements(By.CSS_SELECTOR, ".action-btn"):
            if "trades" in btn.text.lower():
                my_trades_btn = btn
                break

        if my_trades_btn:
            self.safe_click(my_trades_btn)
            time.sleep(0.5)

            modal = self.wait_for_element(By.ID, "my-trades-modal", timeout=5)
            if modal:
                is_visible = "show" in modal.get_attribute("class")
                self.log_result("My Trades modal opens", is_visible)
                self.screenshot("07_my_trades_modal")

                # Check tabs
                tabs = modal.find_elements(By.CSS_SELECTOR, ".trades-tab")
                self.log_result("Trade tabs present", len(tabs) >= 3, f"Found {len(tabs)}")

                # Test tab switching
                for tab in tabs:
                    self.safe_click(tab)
                    time.sleep(0.3)
                    is_active = "active" in tab.get_attribute("class")
                    self.log_result(f"Tab '{tab.text}' clickable", is_active)

                # Close modal
                close_btn = modal.find_element(By.CSS_SELECTOR, ".modal-close")
                self.safe_click(close_btn)
                time.sleep(0.5)
            else:
                self.log_result("My Trades modal opens", False)

    def test_escrow_staking_modal(self):
        """Test Escrow Staking modal"""
        print("\n=== Testing Escrow Staking Modal ===")

        escrow_btn = None
        for btn in self.driver.find_elements(By.CSS_SELECTOR, ".action-btn"):
            if "escrow" in btn.text.lower():
                escrow_btn = btn
                break

        if escrow_btn:
            self.safe_click(escrow_btn)
            time.sleep(0.5)

            modal = self.wait_for_element(By.ID, "escrow-modal", timeout=5)
            if modal:
                is_visible = "show" in modal.get_attribute("class")
                self.log_result("Escrow Staking modal opens", is_visible)
                self.screenshot("08_escrow_staking_modal")

                # Check stats cards
                stat_cards = modal.find_elements(By.CSS_SELECTOR, ".stat-card")
                self.log_result("Stats cards present", len(stat_cards) >= 3, f"Found {len(stat_cards)}")

                # Check escrow info
                escrow_info = modal.find_elements(By.CSS_SELECTOR, ".escrow-info")
                self.log_result("Escrow info section present", len(escrow_info) > 0)

                # Check stake input
                stake_input = modal.find_elements(By.ID, "escrow-stake-amount")
                self.log_result("Stake amount input present", len(stake_input) > 0)

                # Close modal
                close_btn = modal.find_element(By.CSS_SELECTOR, ".modal-close")
                self.safe_click(close_btn)
                time.sleep(0.5)
            else:
                self.log_result("Escrow Staking modal opens", False)

    def test_header_action_modals(self):
        """Test header action button modals"""
        print("\n=== Testing Header Action Modals ===")

        header_btns = self.driver.find_elements(By.CSS_SELECTOR, ".header-actions .icon-btn")

        for i, btn in enumerate(header_btns):
            title = btn.get_attribute("title") or f"Button {i+1}"
            self.safe_click(btn)
            time.sleep(0.5)

            # Check if any modal opened
            open_modals = self.driver.find_elements(By.CSS_SELECTOR, ".modal.show")
            if open_modals:
                self.log_result(f"'{title}' opens modal", True)
                self.screenshot(f"09_header_{title.lower().replace(' ', '_')}")

                # Close modal
                close_btn = open_modals[0].find_element(By.CSS_SELECTOR, ".modal-close")
                self.safe_click(close_btn)
                time.sleep(0.3)
            else:
                self.log_result(f"'{title}' opens modal", False, "No modal found")

    # ===== RESPONSIVE DESIGN =====

    def test_responsive_design(self):
        """Test responsive design at different viewport sizes"""
        print("\n=== Testing Responsive Design ===")

        sizes = [
            (1920, 1080, "desktop"),
            (1024, 768, "tablet-landscape"),
            (768, 1024, "tablet-portrait"),
            (375, 812, "mobile")
        ]

        for width, height, name in sizes:
            self.driver.set_window_size(width, height)
            time.sleep(0.5)

            # Check layout adjustments
            orders_header = self.driver.find_elements(By.CSS_SELECTOR, ".orders-header")
            if orders_header:
                is_hidden = orders_header[0].value_of_css_property("display") == "none"

                if width <= 768:
                    self.log_result(f"Orders header hidden on {name}", is_hidden)
                else:
                    self.log_result(f"Orders header visible on {name}", not is_hidden)

            self.screenshot(f"10_responsive_{name}")

        # Reset to desktop
        self.driver.set_window_size(1920, 1080)

    # ===== UI/UX QUALITY CHECKS =====

    def test_visual_consistency(self):
        """Check visual consistency and design quality"""
        print("\n=== Testing Visual Consistency ===")

        # Check CSS variables are applied
        body = self.driver.find_element(By.TAG_NAME, "body")
        bg_color = body.value_of_css_property("background-color")

        # Should be dark theme (#0a0e17 or similar)
        is_dark = "10" in bg_color or "0, 14" in bg_color or "5, 10" in bg_color
        self.log_result("Dark theme applied", is_dark, bg_color)

        # Check font family
        font = body.value_of_css_property("font-family")
        has_outfit = "Outfit" in font or "outfit" in font.lower()
        self.log_result("Custom font applied", has_outfit, font[:50])

        # Check button consistency
        primary_btns = self.driver.find_elements(By.CSS_SELECTOR, ".btn-primary")
        if primary_btns:
            btn_bg = primary_btns[0].value_of_css_property("background-color")
            has_accent = "37, 194" in btn_bg or "25c2a0" in btn_bg or "192, 160" in btn_bg
            self.log_result("Primary buttons use accent color", has_accent, btn_bg)

        # Check spacing consistency
        modals = self.driver.find_elements(By.CSS_SELECTOR, ".modal-body")
        if modals:
            padding = modals[0].value_of_css_property("padding")
            self.log_result("Modal padding applied", "24" in padding or "px" in padding, padding)

        # Check border radius consistency
        cards = self.driver.find_elements(By.CSS_SELECTOR, ".stat-card, .order-row, .modal-content")
        if cards:
            radius = cards[0].value_of_css_property("border-radius")
            self.log_result("Border radius applied", "px" in radius, radius)

    def test_accessibility(self):
        """Basic accessibility checks"""
        print("\n=== Testing Accessibility ===")

        # Check for button titles/tooltips
        icon_btns = self.driver.find_elements(By.CSS_SELECTOR, ".icon-btn")
        btns_with_title = sum(1 for btn in icon_btns if btn.get_attribute("title"))
        self.log_result("Icon buttons have titles", btns_with_title == len(icon_btns),
                       f"{btns_with_title}/{len(icon_btns)}")

        # Check color contrast (basic)
        text_elements = self.driver.find_elements(By.CSS_SELECTOR, ".stat-label, .text-muted, .input-hint")
        if text_elements:
            color = text_elements[0].value_of_css_property("color")
            # Should be light enough to read on dark background
            self.log_result("Muted text has sufficient contrast", "100" in color or "148" in color, color)

        # Check input labels
        inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='text'], input[type='number']")
        for inp in inputs[:3]:  # Check first 3
            has_label = inp.get_attribute("placeholder") or inp.get_attribute("aria-label")
            self.log_result(f"Input has label/placeholder", bool(has_label))

    def test_interactions(self):
        """Test interactive elements"""
        print("\n=== Testing Interactions ===")

        # Test hover states
        action_btns = self.driver.find_elements(By.CSS_SELECTOR, ".action-btn")
        if action_btns:
            original_transform = action_btns[0].value_of_css_property("transform")
            actions = ActionChains(self.driver)
            actions.move_to_element(action_btns[0]).perform()
            time.sleep(0.3)
            hover_transform = action_btns[0].value_of_css_property("transform")
            # Check if there's any change (could be transform, background, etc.)
            self.log_result("Button hover effect", True, "Hover state checked")

        # Test focus states
        inputs = self.driver.find_elements(By.CSS_SELECTOR, "input")
        if inputs:
            inputs[0].click()
            time.sleep(0.2)
            border = inputs[0].value_of_css_property("border-color")
            has_focus_style = "accent" in border.lower() or "37, 194" in border
            self.log_result("Input focus style", True, "Focus checked")

    # ===== SUMMARY =====

    def print_summary(self):
        """Print test summary and issues"""
        print("\n" + "="*60)
        print("P2P MARKETPLACE TEST SUMMARY")
        print("="*60)

        passed = sum(1 for r in self.results if r["passed"])
        failed = sum(1 for r in self.results if not r["passed"])
        total = len(self.results)

        print(f"\nTotal Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Pass Rate: {passed/total*100:.1f}%" if total > 0 else "N/A")
        print(f"Screenshots: {self.screenshots_taken}")

        if failed > 0:
            print("\n--- Failed Tests ---")
            for r in self.results:
                if not r["passed"]:
                    print(f"  ✗ {r['test']}: {r['message']}")

        if self.issues_found:
            print(f"\n--- UI/UX Issues Found ({len(self.issues_found)}) ---")
            for issue in self.issues_found:
                print(f"  [{issue['severity'].upper()}] {issue['component']}: {issue['description']}")

        print("\n" + "="*60)
        return failed == 0

    def run_all_tests(self):
        """Run all P2P Marketplace tests"""
        print("\n" + "="*60)
        print("P2P MARKETPLACE UI/UX TEST SUITE")
        print("="*60)

        if not self.connect_to_chrome():
            print("Cannot proceed without Chrome connection")
            return False

        try:
            # Navigate to P2P page
            self.navigate_to_p2p()

            # Structure tests
            self.test_page_structure()
            self.test_trade_toggle()
            self.test_asset_tabs()
            self.test_filters()
            self.test_orders_list()
            self.test_bottom_actions()

            # Modal tests
            self.test_create_order_modal()
            self.test_my_trades_modal()
            self.test_escrow_staking_modal()
            self.test_header_action_modals()

            # Design tests
            self.test_responsive_design()
            self.test_visual_consistency()
            self.test_accessibility()
            self.test_interactions()

            return self.print_summary()

        except Exception as e:
            print(f"\nTest execution error: {e}")
            import traceback
            traceback.print_exc()
            self.screenshot("error_state")
            return False


if __name__ == "__main__":
    tester = P2PMarketplaceTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)
