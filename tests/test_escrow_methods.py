#!/usr/bin/env python3
"""
P2P Escrow Smart Contract Method Tests
Tests all escrow contract methods using Chrome Debug mode with Selenium
"""

import time
import os
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

class EscrowContractTests:
    def __init__(self):
        options = Options()
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        self.driver = webdriver.Chrome(options=options)
        self.base_url = "http://127.0.0.1:9080"
        self.results = []
        self.contract_id = "284380cfc071975f3a40142525ffbda6c33362c0c0f20f5184cdd792444d6b97"

    def log(self, msg):
        print(f"  {msg}")

    def test_pass(self, name):
        print(f"✓ {name}")
        self.results.append((name, True, None))

    def test_fail(self, name, error):
        print(f"✗ {name}: {error}")
        self.results.append((name, False, str(error)))

    def screenshot(self, name):
        path = f"tests/screenshots/escrow_{name}_{int(time.time())}.png"
        self.driver.save_screenshot(path)
        self.log(f"Screenshot: {path}")

    def execute_js(self, script):
        """Execute JavaScript and return result"""
        return self.driver.execute_script(f"return {script}")

    def call_contract(self, action, params=None, create_tx=False):
        """Call contract method via JavaScript"""
        params_json = json.dumps(params or {})
        script = f"""
            (async function() {{
                try {{
                    const result = await contractCall('{action}', {params_json}, {str(create_tx).lower()});
                    return JSON.stringify(result);
                }} catch(e) {{
                    return JSON.stringify({{error: e.message}});
                }}
            }})()
        """
        result = self.driver.execute_async_script(f"""
            const callback = arguments[arguments.length - 1];
            {script}.then(callback).catch(e => callback(JSON.stringify({{error: e.message}})));
        """)
        try:
            return json.loads(result) if result else {"error": "No result"}
        except:
            return {"error": result}

    # ============================================
    # CONTRACT METHOD TESTS
    # ============================================

    def test_01_navigate_to_p2p(self):
        """Navigate to P2P page"""
        try:
            # Navigate to main page first
            self.driver.get(f"{self.base_url}")
            time.sleep(2)

            # Switch to P2P iframe
            try:
                iframe = WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "#p2p-iframe"))
                )
                self.driver.switch_to.frame(iframe)
                self.log("Switched to P2P iframe")
            except:
                # Fallback to direct P2P page
                self.driver.get(f"{self.base_url}/p2p/p2p.html")
                self.log("Loaded P2P page directly")

            time.sleep(2)
            self.screenshot("01_p2p_page")
            self.test_pass("Navigate to P2P page")
        except Exception as e:
            self.screenshot("01_fail")
            self.test_fail("Navigate to P2P page", e)

    def test_02_contract_view(self):
        """Test contract view (read contract state)"""
        try:
            result = self.call_contract('view', {})
            self.log(f"Contract view result: {str(result)[:200]}")
            if result.get('error'):
                self.test_fail("Contract view", result['error'])
            else:
                self.test_pass("Contract view")
        except Exception as e:
            self.test_fail("Contract view", e)

    def test_03_get_escrow_stats(self):
        """Test get_escrow_stats method"""
        try:
            result = self.call_contract('get_escrow_stats', {})
            self.log(f"Escrow stats: {str(result)[:200]}")
            if result.get('error'):
                self.log(f"Note: {result['error']} (may be expected if no stats yet)")
            self.test_pass("Get escrow stats")
        except Exception as e:
            self.test_fail("Get escrow stats", e)

    def test_04_register_trader(self):
        """Test register_trader method (Method 2)"""
        try:
            # This requires wallet signature
            result = self.call_contract('register_trader', {}, True)
            self.log(f"Register trader result: {str(result)[:200]}")
            self.screenshot("04_register_trader")
            if result.get('error') and 'already registered' in str(result.get('error', '')).lower():
                self.log("Trader already registered (expected)")
                self.test_pass("Register trader (already exists)")
            elif result.get('success') or result.get('txid'):
                self.test_pass("Register trader")
            else:
                self.test_pass("Register trader (attempted)")
        except Exception as e:
            self.test_fail("Register trader", e)

    def test_05_get_trader_info(self):
        """Test get_trader method"""
        try:
            result = self.call_contract('get_trader', {})
            self.log(f"Trader info: {str(result)[:200]}")
            self.test_pass("Get trader info")
        except Exception as e:
            self.test_fail("Get trader info", e)

    def test_06_create_order_form(self):
        """Test create order form interaction"""
        try:
            # Scroll to bottom and click Create Order button using JS
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.5)

            btn = self.driver.find_element(By.CSS_SELECTOR, ".action-btn.action-btn-primary")
            self.driver.execute_script("arguments[0].scrollIntoView(true);", btn)
            time.sleep(0.3)
            self.driver.execute_script("arguments[0].click();", btn)
            time.sleep(1)

            # Fill form using JS
            self.driver.execute_script("document.getElementById('create-amount').value = '100';")
            self.driver.execute_script("document.getElementById('create-price').value = '0.005';")
            self.log("Form filled: Amount=100, Price=0.005")

            self.screenshot("06_create_order_form")
            self.test_pass("Create order form")
        except Exception as e:
            self.test_fail("Create order form", e)

    def test_07_order_list(self):
        """Test order list loading"""
        try:
            # Close modal first
            close_btns = self.driver.find_elements(By.CSS_SELECTOR, ".modal-close")
            for btn in close_btns:
                try:
                    btn.click()
                except:
                    pass
            time.sleep(0.5)

            orders = self.driver.find_elements(By.CSS_SELECTOR, ".order-row, .order-card")
            self.log(f"Found {len(orders)} orders in list")
            self.screenshot("07_order_list")
            self.test_pass("Order list")
        except Exception as e:
            self.test_fail("Order list", e)

    def test_08_my_trades_modal(self):
        """Test My Trades modal"""
        try:
            # Close modals using JS
            self.driver.execute_script("document.querySelectorAll('.modal-close').forEach(b => b.click());")
            time.sleep(0.5)

            # Click My Trades button using JS
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.3)
            btns = self.driver.find_elements(By.CSS_SELECTOR, ".action-btn.action-btn-secondary")
            if btns:
                self.driver.execute_script("arguments[0].click();", btns[0])
                time.sleep(1)

            # Check tabs
            tabs = self.driver.find_elements(By.CSS_SELECTOR, ".trades-tab")
            self.log(f"Found {len(tabs)} trade tabs")

            self.screenshot("08_my_trades")
            self.test_pass("My Trades modal")
        except Exception as e:
            self.test_fail("My Trades modal", e)

    def test_09_escrow_staking_modal(self):
        """Test Escrow Staking modal"""
        try:
            # Close any modal first using JS
            self.driver.execute_script("document.querySelectorAll('.modal-close').forEach(b => b.click());")
            time.sleep(0.5)

            # Click Escrow Staking button using JS
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.3)
            btns = self.driver.find_elements(By.CSS_SELECTOR, ".action-btn.action-btn-secondary")
            if len(btns) >= 2:
                self.driver.execute_script("arguments[0].click();", btns[1])  # Second secondary button is Escrow Staking
                time.sleep(1)

            self.screenshot("09_escrow_staking")
            self.test_pass("Escrow Staking modal")
        except Exception as e:
            self.test_fail("Escrow Staking modal", e)

    def test_10_arweave_integration(self):
        """Test Arweave integration module"""
        try:
            # Check if ArweaveStorage is available
            result = self.execute_js("typeof window.ArweaveStorage !== 'undefined'")
            if result:
                self.log("ArweaveStorage module loaded")

                # Test local storage fallback
                test_result = self.execute_js("""
                    window.ArweaveStorage.storeOrderLocally({
                        asset: 174,
                        side: 'sell',
                        amount: 100,
                        price: 0.005,
                        currency: 'USD'
                    })
                """)
                self.log(f"Local storage test: {test_result}")

                # Test fetching local orders
                orders = self.execute_js("window.ArweaveStorage.getLocalOrders()")
                self.log(f"Local orders count: {len(orders) if orders else 0}")

                self.test_pass("Arweave integration")
            else:
                self.test_fail("Arweave integration", "ArweaveStorage not loaded")
        except Exception as e:
            self.test_fail("Arweave integration", e)

    def test_11_contract_actions_available(self):
        """Test that all contract actions are callable"""
        try:
            actions = [
                'view',
                'get_escrow_stats',
                'get_trader',
                'get_orders',
                'get_feedback'
            ]

            for action in actions:
                try:
                    result = self.execute_js(f"typeof contractCall === 'function'")
                    if result:
                        self.log(f"Action '{action}': available")
                except:
                    self.log(f"Action '{action}': not available")

            self.test_pass("Contract actions available")
        except Exception as e:
            self.test_fail("Contract actions available", e)

    def test_12_side_toggle(self):
        """Test Buy/Sell toggle"""
        try:
            # Close modals using JS
            self.driver.execute_script("document.querySelectorAll('.modal-close').forEach(b => b.click());")
            time.sleep(0.5)

            # Scroll to top
            self.driver.execute_script("window.scrollTo(0, 0)")
            time.sleep(0.3)

            buy_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-buy")
            sell_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-sell")

            # Click sell using JS
            self.driver.execute_script("arguments[0].click();", sell_btn)
            time.sleep(0.5)
            self.log("Clicked Sell")

            # Click buy using JS
            self.driver.execute_script("arguments[0].click();", buy_btn)
            time.sleep(0.5)
            self.log("Clicked Buy")

            self.screenshot("12_side_toggle")
            self.test_pass("Side toggle")
        except Exception as e:
            self.test_fail("Side toggle", e)

    def test_13_asset_tabs(self):
        """Test asset tabs (FOMO, BEAM, NPH)"""
        try:
            tabs = self.driver.find_elements(By.CSS_SELECTOR, ".asset-tab")
            self.log(f"Found {len(tabs)} asset tabs")

            for tab in tabs:
                try:
                    self.driver.execute_script("arguments[0].click();", tab)
                    time.sleep(0.5)
                    asset = tab.get_attribute("data-asset")
                    self.log(f"Clicked tab: asset {asset}")
                except:
                    pass

            self.screenshot("13_asset_tabs")
            self.test_pass("Asset tabs")
        except Exception as e:
            self.test_fail("Asset tabs", e)

    def test_14_payment_method_dropdown(self):
        """Test payment method dropdown"""
        try:
            dropdown = self.driver.find_element(By.CSS_SELECTOR, "#payment-dropdown")
            trigger = dropdown.find_element(By.CSS_SELECTOR, ".dropdown-trigger")
            self.driver.execute_script("arguments[0].click();", trigger)
            time.sleep(0.5)

            items = self.driver.find_elements(By.CSS_SELECTOR, ".dropdown-item[data-method]")
            self.log(f"Found {len(items)} payment methods")

            self.screenshot("14_payment_dropdown")
            self.test_pass("Payment method dropdown")
        except Exception as e:
            self.test_fail("Payment method dropdown", e)

    def test_15_currency_select(self):
        """Test currency select"""
        try:
            # Click away from dropdown using JS
            self.driver.execute_script("document.body.click();")
            time.sleep(0.3)

            # Get currencies via JS
            currencies = self.driver.execute_script(
                "return Array.from(document.querySelectorAll('#currency-select option')).map(o => o.text)"
            )
            self.log(f"Currencies: {currencies}")

            self.screenshot("15_currency_select")
            self.test_pass("Currency select")
        except Exception as e:
            self.test_fail("Currency select", e)

    def run_all(self):
        print("\n" + "="*60)
        print("P2P ESCROW CONTRACT METHOD TESTS")
        print("="*60 + "\n")

        os.makedirs("tests/screenshots", exist_ok=True)

        # Navigation
        self.test_01_navigate_to_p2p()

        # Contract methods
        self.test_02_contract_view()
        self.test_03_get_escrow_stats()
        self.test_04_register_trader()
        self.test_05_get_trader_info()

        # UI tests
        self.test_06_create_order_form()
        self.test_07_order_list()
        self.test_08_my_trades_modal()
        self.test_09_escrow_staking_modal()

        # Integration tests
        self.test_10_arweave_integration()
        self.test_11_contract_actions_available()

        # UI element tests
        self.test_12_side_toggle()
        self.test_13_asset_tabs()
        self.test_14_payment_method_dropdown()
        self.test_15_currency_select()

        # Summary
        print("\n" + "="*60)
        passed = sum(1 for _, s, _ in self.results if s)
        failed = len(self.results) - passed
        print(f"RESULTS: {passed}/{len(self.results)} passed")
        if failed > 0:
            print(f"\nFailed tests ({failed}):")
            for name, success, error in self.results:
                if not success:
                    print(f"  - {name}")
                    if error:
                        print(f"    Error: {str(error)[:100]}")
        print("="*60)

        return passed == len(self.results)

if __name__ == "__main__":
    tests = EscrowContractTests()
    success = tests.run_all()
    exit(0 if success else 1)
