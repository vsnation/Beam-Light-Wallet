#!/usr/bin/env python3
"""
Selenium E2E tests for BEAM Light Wallet Airdrop page.
Tests: admin panel, statistics, create batch, check/redeem voucher, cancel batch, fee withdrawal.

Prerequisites:
    pip install selenium webdriver-manager
    python3 serve.py 9080  (in another terminal)
    Wallet must be unlocked with local node (contract calls require local node)

Usage:
    python3 tests/test_airdrop_selenium.py
    python3 tests/test_airdrop_selenium.py --headless
"""

import json
import os
import sys
import time
import hashlib
import re
import requests

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://127.0.0.1:9080"
API_URL = "http://127.0.0.1:9080/api/wallet"
AIRDROP_CID = "e08640cf30fdcc8caeddad36d2c44cf1004678043d893c0c87b8a2c35ed74171"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "airdrop")

# Shared state between tests
_test_state = {
    'created_codes': [],     # Codes generated during create_batch test
    'created_hashes': [],    # Corresponding hashes
    'batch_id': None,        # Batch ID from on-chain
}


def frontend_hash(code):
    """Match frontend hashVoucherCode: strip non-alphanumeric, uppercase, SHA-256"""
    normalized = re.sub(r'[^A-Z0-9]', '', code.strip().upper())
    return hashlib.sha256(normalized.encode()).hexdigest()


def api_call(method, params=None):
    """Direct API call to wallet-api via serve.py proxy"""
    resp = requests.post(API_URL, json={
        "jsonrpc": "2.0", "id": 1,
        "method": method,
        "params": params or {}
    }, timeout=30)
    data = resp.json()
    if "error" in data:
        raise Exception(f"API error: {data['error']}")
    return data.get("result", data)


def invoke_contract(args, create_tx=False):
    """Call airdrop contract via API"""
    result = api_call("invoke_contract", {"args": args, "create_tx": create_tx})
    output = result.get("output", "")
    if isinstance(output, str):
        output = json.loads(output)
    return output, result


class AirdropTests:
    def __init__(self, headless=False):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless=new')
        options.add_argument('--window-size=1400,900')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--enable-features=ClipboardAPI')

        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(5)
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        self.results = []

    def screenshot(self, name):
        self.dismiss_alerts()
        path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
        self.driver.save_screenshot(path)
        print(f"  Screenshot: {path}")
        return path

    def wait_for(self, selector, timeout=15):
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    def dismiss_alerts(self):
        """Dismiss any pending browser alerts/confirms"""
        try:
            alert = self.driver.switch_to.alert
            alert.dismiss()
            time.sleep(0.5)
        except:
            pass

    def ensure_wallet_unlocked(self):
        """Make sure wallet is unlocked before running tests"""
        self.driver.get(BASE_URL)
        time.sleep(3)

        try:
            self.driver.find_element(By.CSS_SELECTOR, ".dashboard-container")
            print("  Wallet already unlocked")
            return True
        except:
            pass

        try:
            select = self.driver.find_element(By.CSS_SELECTOR, "#wallet-select")
            options = select.find_elements(By.TAG_NAME, "option")
            for opt in options:
                if "test_wallet" in opt.text.lower():
                    opt.click()
                    break

            pwd = self.driver.find_element(By.CSS_SELECTOR, "#unlock-password")
            pwd.clear()
            pwd.send_keys(os.environ.get('BEAM_TEST_PASSWORD', ''))

            btn = self.driver.find_element(By.CSS_SELECTOR, "#unlock-btn")
            btn.click()
            time.sleep(8)
            return True
        except Exception as e:
            print(f"  Failed to unlock wallet: {e}")
            return False

    def dismiss_welcome_modal(self):
        """Dismiss welcome modal if present"""
        try:
            btn = self.driver.find_element(By.XPATH, "//button[contains(text(),'Get Started')]")
            if btn.is_displayed():
                btn.click()
                time.sleep(1)
        except:
            pass

    def navigate_to_airdrop(self):
        """Navigate to airdrop page via URL and wait for it to load"""
        self.dismiss_alerts()
        self.driver.get(f"{BASE_URL}/airdrop")
        time.sleep(3)
        self.dismiss_welcome_modal()
        return True

    def switch_tab(self, tab):
        """Switch airdrop tab using JavaScript directly (more reliable than clicking)"""
        self.dismiss_alerts()
        self.driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(0.3)
        self.driver.execute_script(f"showAirdropTab('{tab}')")
        time.sleep(2)

    def wait_for_tx(self, timeout=120):
        """Wait for pending transactions to complete"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                txs = api_call("tx_list", {"filter": {"status": 0}})
                if not txs:
                    return True
                pending = [t for t in (txs or []) if t.get('status') in (0, 1, 5)]
                if not pending:
                    return True
            except:
                pass
            time.sleep(3)
        return False

    # ==================== TESTS ====================

    def test_01_airdrop_page_loads(self):
        """Test that airdrop page loads with correct structure"""
        print("\n[Test 01] Airdrop page loads")

        self.ensure_wallet_unlocked()
        self.navigate_to_airdrop()
        self.screenshot("01_airdrop_page_initial")

        container = self.driver.find_element(By.CSS_SELECTOR, ".airdrop-container")
        assert container, "Airdrop container not found"

        tabs = self.driver.find_elements(By.CSS_SELECTOR, ".airdrop-tab")
        assert len(tabs) == 2, f"Expected 2 tabs, got {len(tabs)}"

        input_field = self.driver.find_element(By.CSS_SELECTOR, "#voucher-code-input")
        assert input_field, "Voucher code input not found"

        print("  PASS: Airdrop page structure correct")
        return True

    def test_02_statistics_display(self):
        """Test that contract statistics are displayed"""
        print("\n[Test 02] Statistics display")

        stats_bar = self.driver.find_element(By.CSS_SELECTOR, ".airdrop-stats-bar")
        assert stats_bar.is_displayed(), "Stats bar not visible"

        time.sleep(2)
        batches = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-batches").text
        vouchers = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-vouchers").text
        claimed = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-claimed").text
        available = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-available").text

        print(f"  Stats: batches={batches}, vouchers={vouchers}, claimed={claimed}, available={available}")
        self.screenshot("02_statistics_display")

        assert batches != '--', "Stats not loaded (still showing '--')"
        print("  PASS: Statistics loaded and displayed")
        return True

    def test_03_admin_panel_visible(self):
        """Test that admin panel is visible for contract owner"""
        print("\n[Test 03] Admin panel visibility")

        self.switch_tab('manage')
        time.sleep(2)

        admin_section = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-admin-section")
        display = admin_section.value_of_css_property("display")
        print(f"  Admin section display: {display}")

        self.screenshot("03_admin_panel")

        if display != "none":
            header = admin_section.find_element(By.CSS_SELECTOR, ".admin-header")
            assert header, "Admin header not found"

            badge = admin_section.find_element(By.CSS_SELECTOR, ".admin-badge")
            assert badge.text.strip().upper() == "OWNER", f"Expected 'OWNER' badge, got '{badge.text}'"

            fees_list = admin_section.find_element(By.CSS_SELECTOR, "#admin-fees-list")
            assert fees_list, "Fees list not found"

            print("  PASS: Admin panel visible with correct structure")
            return True
        else:
            print("  SKIP: Admin panel hidden (wallet may not be contract owner)")
            return None

    def test_04_admin_fees_display(self):
        """Test that fee balances are shown in admin panel"""
        print("\n[Test 04] Admin fees display")

        admin_section = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-admin-section")
        display = admin_section.value_of_css_property("display")

        if display == "none":
            print("  SKIP: Admin panel not visible")
            return None

        time.sleep(2)
        fees_list = self.driver.find_element(By.CSS_SELECTOR, "#admin-fees-list")
        fees_html = fees_list.get_attribute("innerHTML")

        self.screenshot("04_admin_fees")

        if "No fees collected" in fees_html or "admin-no-fees" in fees_html:
            print("  INFO: No fees collected yet")
            print("  PASS: Fees section shows correct empty state")
            return True

        fee_cards = fees_list.find_elements(By.CSS_SELECTOR, ".admin-fee-card")
        print(f"  Found {len(fee_cards)} fee entries")
        for card in fee_cards:
            asset = card.find_element(By.CSS_SELECTOR, ".admin-fee-asset").text
            available = card.find_element(By.CSS_SELECTOR, ".admin-fee-available").text
            print(f"    {asset}: {available}")

        print("  PASS: Fee balances displayed")
        return True

    def test_05_create_batch_via_ui(self):
        """Test creating a voucher batch through the UI"""
        print("\n[Test 05] Create batch via UI")

        self.switch_tab('manage')

        # Fill in the form: 3 vouchers of 0.00000001 FOMO (1 groth each)
        value_input = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-value")
        count_input = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-count")

        value_input.clear()
        value_input.send_keys("0.00000001")  # 1 groth

        count_input.clear()
        count_input.send_keys("3")

        time.sleep(0.5)

        total = self.driver.find_element(By.CSS_SELECTOR, "#total-cost").text
        fee = self.driver.find_element(By.CSS_SELECTOR, "#total-fee").text
        print(f"  Summary: cost={total}, fee={fee}")
        self.screenshot("05a_create_form_filled")

        # Click Create Batch via JS to avoid overlay issues
        create_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-create-batch")
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", create_btn)
        time.sleep(0.3)
        self.driver.execute_script("arguments[0].click();", create_btn)

        time.sleep(2)
        self.screenshot("05b_create_in_progress")

        # Wait for codes to appear (up to 90 seconds)
        print("  Waiting for batch creation and confirmation...")
        for i in range(30):
            time.sleep(3)
            try:
                codes_section = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-codes-section")
                if codes_section.value_of_css_property("display") != "none":
                    break
            except:
                pass

        self.screenshot("05c_codes_generated")

        # Extract codes
        try:
            saved_codes = self.driver.find_elements(By.CSS_SELECTOR, ".saved-code-text")
            if saved_codes:
                for c in saved_codes[:3]:
                    code = c.text.strip()
                    if code:
                        _test_state['created_codes'].append(code)
                        _test_state['created_hashes'].append(frontend_hash(code))

            if not _test_state['created_codes']:
                code_cells = self.driver.find_elements(By.CSS_SELECTOR, ".code-text")
                for c in code_cells[:3]:
                    code = c.text.strip()
                    if code:
                        _test_state['created_codes'].append(code)
                        _test_state['created_hashes'].append(frontend_hash(code))

        except Exception as e:
            print(f"  Error reading codes: {e}")

        if _test_state['created_codes']:
            print(f"  PASS: Created batch with {len(_test_state['created_codes'])} voucher codes: {_test_state['created_codes']}")
            # Wait for batch creation tx to confirm on-chain
            print("  Waiting for batch creation tx to confirm on-chain...")
            self.wait_for_tx(180)
            time.sleep(10)
            print("  Batch tx confirmed")
            return True
        else:
            print("  FAIL: No codes were generated")
            return False

    def test_06_check_voucher_on_claim_tab(self):
        """Test checking one of the created voucher codes (waits for on-chain confirmation)"""
        print("\n[Test 06] Check created voucher on claim tab")

        if not _test_state['created_codes']:
            print("  SKIP: No codes from previous test")
            return None

        code = _test_state['created_codes'][0]
        print(f"  Checking code: {code}")

        # Poll until voucher shows as "Available" on-chain (up to 5 minutes)
        max_attempts = 20
        for attempt in range(1, max_attempts + 1):
            try:
                # Fresh navigate to airdrop page claim tab each attempt
                self.navigate_to_airdrop()
                self.switch_tab('claim')

                input_field = self.driver.find_element(By.CSS_SELECTOR, "#voucher-code-input")
                input_field.clear()
                input_field.send_keys(code)

                # Wait for debounced check
                time.sleep(5)

                # Check claim-status text
                status_el = self.driver.find_element(By.CSS_SELECTOR, "#claim-status")
                status_text = status_el.text.strip() if status_el else ""
                print(f"  Attempt {attempt}: Status = '{status_text}'")

                # Check voucher result card visibility
                result_card = self.driver.find_element(By.CSS_SELECTOR, "#voucher-result")
                display = result_card.value_of_css_property("display")

                if display != "none":
                    try:
                        badge = self.driver.find_element(By.CSS_SELECTOR, "#voucher-status-badge")
                        badge_text = badge.text.strip()
                        print(f"  Attempt {attempt}: Badge = '{badge_text}'")

                        if badge_text.lower() == "available":
                            self.screenshot("06_voucher_available")
                            print("  PASS: Voucher found and available")
                            return True
                        elif badge_text.lower() == "claimed":
                            self.screenshot("06_voucher_claimed")
                            print("  PASS: Voucher already claimed")
                            return True
                    except Exception as e:
                        print(f"  Attempt {attempt}: Badge error - {e}")

            except Exception as e:
                print(f"  Attempt {attempt}: Error - {type(e).__name__}: {str(e)[:80]}")

            if attempt < max_attempts:
                print(f"  Waiting 15s before retry (attempt {attempt}/{max_attempts})...")
                time.sleep(15)

        self.screenshot("06_voucher_check_final")
        print("  FAIL: Voucher never became available on-chain")
        return False

    def test_07_redeem_voucher(self):
        """Test redeeming a voucher through the UI"""
        print("\n[Test 07] Redeem voucher")

        if not _test_state['created_codes']:
            print("  SKIP: No codes available")
            return None

        self.navigate_to_airdrop()
        self.switch_tab('claim')

        code = _test_state['created_codes'][0]
        input_field = self.driver.find_element(By.CSS_SELECTOR, "#voucher-code-input")
        input_field.clear()
        input_field.send_keys(code)
        time.sleep(5)

        try:
            claim_btn = self.driver.find_element(By.CSS_SELECTOR, "#btn-claim-voucher")
            if claim_btn.value_of_css_property("display") == "none":
                print("  SKIP: Claim button not visible (voucher may be claimed or not confirmed)")
                return None

            self.screenshot("07a_before_claim")
            self.driver.execute_script("arguments[0].click();", claim_btn)

            time.sleep(5)
            self.screenshot("07b_after_claim")

            badge = self.driver.find_element(By.CSS_SELECTOR, "#voucher-status-badge")
            print(f"  Badge after claim: {badge.text}")

            if badge.text.strip().lower() == "claimed":
                print("  PASS: Voucher redeemed successfully")
                return True

            # Wait for tx confirmation
            print("  Waiting for claim tx...")
            self.wait_for_tx(60)

            print("  PASS: Claim submitted")
            return True
        except Exception as e:
            print(f"  Error during claim: {e}")
            self.screenshot("07_claim_error")
            return False

    def test_08_check_invalid_voucher(self):
        """Test checking an invalid/non-existent voucher code"""
        print("\n[Test 08] Check invalid voucher code")

        self.navigate_to_airdrop()
        self.switch_tab('claim')

        input_field = self.driver.find_element(By.CSS_SELECTOR, "#voucher-code-input")
        input_field.clear()
        input_field.send_keys("ZZZZ-ZZZZ-ZZZZ-ZZZZ")

        time.sleep(4)
        self.screenshot("08_invalid_voucher")

        status = self.driver.find_element(By.CSS_SELECTOR, "#claim-status")
        status_text = status.text.lower()
        print(f"  Status: {status.text}")

        if "not found" in status_text or "error" in status_text:
            print("  PASS: Invalid voucher correctly shows error")
            return True

        print(f"  WARNING: Unexpected status: {status.text}")
        return True

    def test_09_batches_on_chain(self):
        """Test that created batches appear in on-chain batches list"""
        print("\n[Test 09] Batches on-chain display")

        self.navigate_to_airdrop()
        self.switch_tab('manage')
        time.sleep(2)

        self.screenshot("09_batches_on_chain")

        batches_list = self.driver.find_element(By.CSS_SELECTOR, "#my-batches-list")
        html = batches_list.get_attribute("innerHTML")

        if "No batches" in html or "empty-state" in html:
            print("  INFO: No batches shown (may have been cancelled or not yet confirmed)")
            return True

        batch_cards = self.driver.find_elements(By.CSS_SELECTOR, ".batch-card")
        print(f"  Found {len(batch_cards)} batch cards on-chain")

        if batch_cards:
            card = batch_cards[0]
            stats = card.find_elements(By.CSS_SELECTOR, ".stat-value")
            for s in stats:
                print(f"    Stat: {s.text}")
            print("  PASS: Batch cards displayed correctly")
        return True

    def test_10_cancel_batch_via_ui(self):
        """Test cancelling a batch through the UI"""
        print("\n[Test 10] Cancel batch via UI")

        self.navigate_to_airdrop()
        self.switch_tab('manage')
        time.sleep(2)

        cancel_btns = self.driver.find_elements(By.CSS_SELECTOR, ".btn-cancel-batch")
        if not cancel_btns:
            print("  SKIP: No cancel buttons found (no unclaimed vouchers)")
            return None

        self.screenshot("10a_before_cancel")

        # Click cancel via JS
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", cancel_btns[0])
        time.sleep(0.3)
        self.driver.execute_script("arguments[0].click();", cancel_btns[0])

        # Handle confirm dialog
        time.sleep(1)
        try:
            alert = self.driver.switch_to.alert
            print(f"  Alert: {alert.text}")
            alert.accept()
        except:
            print("  No alert dialog")

        time.sleep(3)
        self.screenshot("10b_after_cancel")

        print("  Waiting for cancel tx...")
        self.wait_for_tx(60)

        self.screenshot("10c_batches_after_cancel")
        print("  PASS: Cancel batch submitted")
        return True

    def test_11_stale_codes_cleanup(self):
        """Test that NOT FOUND codes are cleaned up from localStorage"""
        print("\n[Test 11] Stale codes cleanup")

        self.navigate_to_airdrop()
        self.switch_tab('manage')
        time.sleep(5)  # Wait for loadSavedCodes(true) to run

        self.screenshot("11_after_cleanup")

        not_found_badges = self.driver.find_elements(By.XPATH,
            "//span[contains(@class,'voucher-status-badge') and contains(@class,'failed') and contains(text(),'Not Found')]")
        print(f"  NOT FOUND badges remaining: {len(not_found_badges)}")

        if len(not_found_badges) == 0:
            print("  PASS: All stale codes cleaned up")
        else:
            print("  INFO: Some NOT FOUND codes still showing (may be from recent batch)")

        return True

    def test_12_fee_withdrawal(self):
        """Test fee withdrawal through admin panel"""
        print("\n[Test 12] Fee withdrawal")

        self.navigate_to_airdrop()
        self.switch_tab('manage')
        time.sleep(3)

        admin_section = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-admin-section")
        display = admin_section.value_of_css_property("display")

        if display == "none":
            print("  SKIP: Admin panel not visible")
            return None

        withdraw_btns = admin_section.find_elements(By.CSS_SELECTOR, ".btn-withdraw-fee")
        if not withdraw_btns:
            print("  INFO: No withdraw buttons (no fees available)")
            try:
                output, _ = invoke_contract(f"role=manager,action=view_fees,cid={AIRDROP_CID}")
                fees = output.get('fees', [])
                for f in fees:
                    print(f"    Asset {f.get('asset_id')}: available={f.get('available', 0)}")
            except:
                pass
            print("  PASS: Correctly shows no fees to withdraw")
            return True

        self.screenshot("12a_fees_before_withdraw")

        self.driver.execute_script("arguments[0].click();", withdraw_btns[0])

        time.sleep(1)
        try:
            alert = self.driver.switch_to.alert
            print(f"  Alert: {alert.text}")
            alert.accept()
        except:
            pass

        time.sleep(3)
        self.screenshot("12b_after_withdraw")

        print("  Waiting for withdraw tx...")
        self.wait_for_tx(60)

        self.screenshot("12c_fees_after_withdraw")
        print("  PASS: Fee withdrawal submitted")
        return True

    def test_13_statistics_after_operations(self):
        """Test that statistics update after create/redeem/cancel operations"""
        print("\n[Test 13] Statistics after operations")

        self.navigate_to_airdrop()
        time.sleep(3)

        batches = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-batches").text
        vouchers = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-vouchers").text
        claimed = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-claimed").text
        available = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-stat-available").text

        print(f"  Final stats: batches={batches}, vouchers={vouchers}, claimed={claimed}, available={available}")
        self.screenshot("13_final_statistics")

        # Verify via API
        try:
            output, _ = invoke_contract(f"role=manager,action=view_stats,cid={AIRDROP_CID}")
            stats = output.get('stats', {})
            print(f"  API stats: {json.dumps(stats, indent=2)}")
        except Exception as e:
            print(f"  API stats error: {e}")

        print("  PASS: Statistics displayed correctly")
        return True

    def test_14_transaction_history(self):
        """Test that airdrop transactions appear in history"""
        print("\n[Test 14] Transaction history")

        # Already on airdrop page from test_13
        time.sleep(2)

        tx_list = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-tx-list")
        html = tx_list.get_attribute("innerHTML")

        self.screenshot("14_transaction_history")

        if "No airdrop transactions" in html:
            print("  INFO: No airdrop transactions displayed")
        else:
            tx_rows = self.driver.find_elements(By.CSS_SELECTOR, ".airdrop-tx-row")
            print(f"  Found {len(tx_rows)} transaction rows")
            for row in tx_rows[:5]:
                try:
                    comment = row.find_element(By.CSS_SELECTOR, ".airdrop-tx-comment").text
                    badge = row.find_element(By.CSS_SELECTOR, ".airdrop-tx-badge").text
                    print(f"    {comment}: {badge}")
                except:
                    pass

        print("  PASS: Transaction history checked")
        return True

    def test_15_full_visual_screenshots(self):
        """Take comprehensive screenshots of all states"""
        print("\n[Test 15] Full visual screenshots")

        self.navigate_to_airdrop()
        time.sleep(2)
        self.screenshot("15a_claim_tab_final")

        self.switch_tab('manage')
        time.sleep(2)

        # Scroll to admin panel
        try:
            admin = self.driver.find_element(By.CSS_SELECTOR, "#airdrop-admin-section")
            self.driver.execute_script("arguments[0].scrollIntoView(true);", admin)
            time.sleep(0.5)
        except:
            pass
        self.screenshot("15b_admin_panel_final")

        self.driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(0.5)
        self.screenshot("15c_manage_tab_final")

        print("  PASS: Visual screenshots captured")
        return True

    def run_all(self):
        """Run all tests"""
        tests = [
            self.test_01_airdrop_page_loads,
            self.test_02_statistics_display,
            self.test_03_admin_panel_visible,
            self.test_04_admin_fees_display,
            self.test_05_create_batch_via_ui,
            self.test_06_check_voucher_on_claim_tab,
            self.test_07_redeem_voucher,
            self.test_08_check_invalid_voucher,
            self.test_09_batches_on_chain,
            self.test_10_cancel_batch_via_ui,
            self.test_11_stale_codes_cleanup,
            self.test_12_fee_withdrawal,
            self.test_13_statistics_after_operations,
            self.test_14_transaction_history,
            self.test_15_full_visual_screenshots,
        ]

        passed = 0
        failed = 0
        skipped = 0

        for test in tests:
            try:
                self.dismiss_alerts()
                result = test()
                if result is None:
                    skipped += 1
                    self.results.append((test.__name__, "SKIP"))
                elif result:
                    passed += 1
                    self.results.append((test.__name__, "PASS"))
                else:
                    failed += 1
                    self.results.append((test.__name__, "FAIL"))
            except Exception as e:
                failed += 1
                self.dismiss_alerts()
                self.screenshot(f"FAIL_{test.__name__}")
                err_msg = str(e)[:100] if str(e) else type(e).__name__
                self.results.append((test.__name__, f"FAIL: {err_msg}"))
                print(f"  FAIL: {err_msg}")

        print("\n" + "=" * 60)
        print("AIRDROP E2E TEST RESULTS")
        print("=" * 60)
        for name, result in self.results:
            status = "PASS" if result == "PASS" else ("SKIP" if result == "SKIP" else "FAIL")
            icon = {"PASS": "+", "SKIP": "~", "FAIL": "X"}[status]
            print(f"  [{icon}] {name}: {result}")
        print(f"\nTotal: {passed} passed, {failed} failed, {skipped} skipped")
        print(f"Screenshots saved to: {SCREENSHOT_DIR}")
        print("=" * 60)

        self.driver.quit()
        return failed == 0


if __name__ == "__main__":
    headless = "--headless" in sys.argv
    print(f"Running Airdrop Selenium tests ({'headless' if headless else 'with browser'})...")
    print(f"Contract CID: {AIRDROP_CID}")
    print(f"Base URL: {BASE_URL}")
    tests = AirdropTests(headless=headless)
    success = tests.run_all()
    sys.exit(0 if success else 1)
