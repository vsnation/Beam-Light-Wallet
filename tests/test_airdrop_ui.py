#!/usr/bin/env python3
"""
Selenium UI test for Airdrop page in BEAM Light Wallet.
Tests: Create batch, check voucher, claim voucher, security (hash-only fails).
Uses JS clicks/interactions to avoid overlay issues.
"""

import time
import json
import os
import sys
import hashlib
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "airdrop")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

# Will store generated codes here
TEST_CODES = []

def screenshot(driver, name):
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    driver.save_screenshot(path)
    print(f"  Screenshot: {path}")

def js(driver, script):
    return driver.execute_script(script)

def js_click(driver, selector):
    js(driver, f"document.querySelector('{selector}').click()")

def js_set_value(driver, selector, value):
    js(driver, f"""
        var el = document.querySelector('{selector}');
        el.value = '{value}';
        el.dispatchEvent(new Event('input', {{bubbles: true}}));
        el.dispatchEvent(new Event('change', {{bubbles: true}}));
    """)

def js_text(driver, selector):
    return js(driver, f"return document.querySelector('{selector}')?.textContent || ''")

def js_visible(driver, selector):
    return js(driver, f"return document.querySelector('{selector}')?.offsetParent !== null")

def js_display(driver, selector):
    return js(driver, f"""
        var el = document.querySelector('{selector}');
        if (!el) return 'not found';
        var style = window.getComputedStyle(el);
        return style.display;
    """)

def main():
    headless = "--headless" in sys.argv

    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1400,1000")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")

    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(2)

    results = []

    def run_test(name, func):
        print(f"\n{'='*60}")
        print(f"TEST: {name}")
        print(f"{'='*60}")
        try:
            func()
            results.append((name, "PASS"))
            print(f"  RESULT: PASS")
        except Exception as e:
            screenshot(driver, f"FAIL_{name.replace(' ', '_')}")
            results.append((name, f"FAIL: {e}"))
            print(f"  RESULT: FAIL: {e}")

    try:
        # ============================
        # SETUP
        # ============================
        print("\n--- SETUP ---")
        driver.get(BASE_URL)
        time.sleep(4)

        # Dismiss guide overlay if present
        js(driver, """
            var overlay = document.getElementById('guide-overlay');
            if (overlay) overlay.classList.remove('active');
            overlay && (overlay.style.display = 'none');
        """)
        time.sleep(0.5)

        # Hide debug console to prevent click interception
        js(driver, """
            var dc = document.querySelector('.debug-console');
            if (dc) dc.style.display = 'none';
            var db = document.querySelector('.debug-toggle');
            if (db) db.style.display = 'none';
        """)

        # Check if wallet needs unlocking
        has_wallet_select = js(driver, "return document.getElementById('wallet-select') !== null")
        welcome_visible = js(driver, """
            var wc = document.querySelector('.welcome-container');
            return wc && wc.offsetParent !== null && window.getComputedStyle(wc).display !== 'none';
        """)
        if has_wallet_select and welcome_visible:
            print("  Unlocking wallet...")
            js(driver, """
                var select = document.getElementById('wallet-select');
                for (var i = 0; i < select.options.length; i++) {
                    if (select.options[i].text.includes('test_wallet')) {
                        select.selectedIndex = i;
                        break;
                    }
                }
            """)
            js_set_value(driver, "#unlock-password", os.environ.get('BEAM_TEST_PASSWORD', ''))
            js_click(driver, "#unlock-btn")
            time.sleep(10)
            print("  Wallet unlocked")
        else:
            print("  Wallet already unlocked")

        screenshot(driver, "01_dashboard")

        # Navigate to Airdrop
        print("  Navigating to Airdrop...")
        js_click(driver, '.nav-item[data-page="airdrop"]')
        time.sleep(3)
        screenshot(driver, "02_airdrop_page")

        # ============================
        # TEST 1: Page loads with stats
        # ============================
        def test_page_loads():
            addr = js_text(driver, "#airdrop-contract-address")
            print(f"  Contract: {addr}")
            assert addr and len(addr) > 10, f"Contract address not shown: '{addr}'"

            time.sleep(2)
            batches = js_text(driver, "#airdrop-stat-batches")
            vouchers = js_text(driver, "#airdrop-stat-vouchers")
            claimed = js_text(driver, "#airdrop-stat-claimed")
            available = js_text(driver, "#airdrop-stat-available")
            print(f"  Stats: batches={batches}, vouchers={vouchers}, claimed={claimed}, available={available}")
            assert batches != "--", "Stats not loaded"
            screenshot(driver, "03_stats")

        run_test("Page loads with stats", test_page_loads)

        # ============================
        # TEST 2: Create batch
        # ============================
        def test_create_batch():
            global TEST_CODES

            # Switch to manage tab
            js_click(driver, '.airdrop-tab[data-airdrop-tab="manage"]')
            time.sleep(1)

            # Fill form
            js_set_value(driver, "#airdrop-value", "0.1")
            js_set_value(driver, "#airdrop-count", "2")
            time.sleep(1)
            screenshot(driver, "04_form_filled")

            cost = js_text(driver, "#total-cost")
            fee = js_text(driver, "#total-fee")
            print(f"  Cost: {cost}, Fee: {fee}")

            # Scroll to button and click via JS
            js(driver, "document.getElementById('btn-create-batch').scrollIntoView({block:'center'})")
            time.sleep(0.5)
            js_click(driver, "#btn-create-batch")

            print("  Waiting for batch creation (up to 120s)...")
            for i in range(24):
                time.sleep(5)
                # Check if codes section appeared
                display = js_display(driver, "#airdrop-codes-section")
                if display != "none" and display != "not found":
                    print(f"  Codes appeared after ~{(i+1)*5}s")
                    break
                # Check for error toast
                error_text = js(driver, """
                    var toasts = document.querySelectorAll('.toast');
                    var errors = [];
                    toasts.forEach(t => { if (t.textContent.includes('Error') || t.textContent.includes('error') || t.textContent.includes('failed')) errors.push(t.textContent); });
                    return errors.join('; ');
                """)
                if error_text:
                    print(f"  Error detected: {error_text}")

            screenshot(driver, "05_batch_created")

            # Extract codes from table
            codes_data = js(driver, """
                var rows = document.querySelectorAll('#codes-table-body tr');
                var codes = [];
                rows.forEach(function(row) {
                    var cells = row.querySelectorAll('td');
                    if (cells.length >= 2) codes.push(cells[1].textContent.trim());
                });
                return codes;
            """)

            print(f"  Generated codes: {codes_data}")
            assert len(codes_data) >= 2, f"Expected 2+ codes, got {len(codes_data)}"

            TEST_CODES = codes_data
            with open("/tmp/airdrop_test_codes.json", "w") as f:
                json.dump(codes_data, f)

            # Wait for the batch transaction to confirm on-chain
            # This is critical - vouchers don't exist until the block is mined
            print("  Waiting for batch tx to confirm on-chain (up to 120s)...")
            confirmed = False
            for i in range(24):
                time.sleep(5)
                # Check on-chain if voucher exists
                check_result = js(driver, f"""
                    return new Promise(resolve => {{
                        fetch('/api/wallet', {{
                            method: 'POST',
                            headers: {{'Content-Type': 'application/json'}},
                            body: JSON.stringify({{
                                jsonrpc: '2.0', id: 999,
                                method: 'invoke_contract',
                                params: {{ create_tx: false,
                                    args: 'role=user,action=check_voucher,cid=' + '{js_text(driver, "#airdrop-contract-address").split("data-full=")[0]}' + ',hash=' + '{hashlib.sha256("".join(c for c in codes_data[0].upper() if c.isalnum()).encode()).hexdigest()}'
                                }}
                            }})
                        }}).then(r => r.json()).then(d => {{
                            try {{
                                var out = JSON.parse(d.result.output);
                                resolve(out.voucher ? 'found' : 'not_found');
                            }} catch(e) {{ resolve('error'); }}
                        }}).catch(e => resolve('error'));
                    }});
                """)
                if check_result == 'found':
                    print(f"  Batch confirmed on-chain after ~{(i+1)*5}s")
                    confirmed = True
                    break
                # Also check via curl approach - simpler
                saved_text = js_text(driver, "#saved-codes-list")
                if "Confirmed" in saved_text or "confirmed" in saved_text:
                    print(f"  Batch shows confirmed in UI after ~{(i+1)*5}s")
                    confirmed = True
                    break

            if not confirmed:
                # Try a direct API check
                import urllib.request
                code = codes_data[0]
                normalized = ''.join(c for c in code.upper() if c.isalnum())
                code_hash = hashlib.sha256(normalized.encode()).hexdigest()
                for i in range(12):
                    time.sleep(5)
                    try:
                        req = urllib.request.Request(
                            'http://127.0.0.1:9080/api/wallet',
                            data=json.dumps({
                                "jsonrpc": "2.0", "id": 1,
                                "method": "invoke_contract",
                                "params": {
                                    "args": f"role=user,action=check_voucher,cid=8737e0d39575d7015fdea259fa091e41fc293e6c3d54e80d529033c349b5b18e,hash={code_hash}",
                                    "create_tx": False
                                }
                            }).encode(),
                            headers={"Content-Type": "application/json"}
                        )
                        resp = json.loads(urllib.request.urlopen(req).read())
                        output = json.loads(resp['result']['output'])
                        if output.get('voucher'):
                            print(f"  Voucher confirmed via API after ~{(i+1)*5 + 120}s total")
                            confirmed = True
                            break
                    except:
                        pass

            assert confirmed, "Batch transaction did not confirm within timeout"
            screenshot(driver, "05b_batch_confirmed")

        run_test("Create batch", test_create_batch)

        # ============================
        # TEST 3: Saved codes section
        # ============================
        def test_saved_codes():
            js(driver, "document.getElementById('airdrop-saved-codes-section').scrollIntoView({block:'center'})")
            time.sleep(2)
            screenshot(driver, "06_saved_codes")

            saved_text = js_text(driver, "#saved-codes-list")
            print(f"  Saved codes text (first 200): {saved_text[:200]}")

            has_batch = "No saved codes" not in saved_text
            print(f"  Has batch data: {has_batch}")
            assert has_batch, "No saved codes found after batch creation"

        run_test("Saved codes section", test_saved_codes)

        # ============================
        # TEST 4: Check voucher
        # ============================
        def test_check_voucher():
            if not TEST_CODES:
                with open("/tmp/airdrop_test_codes.json") as f:
                    codes = json.load(f)
            else:
                codes = TEST_CODES

            code = codes[0]
            print(f"  Checking code: {code}")

            # Switch to claim tab
            js_click(driver, '.airdrop-tab[data-airdrop-tab="claim"]')
            time.sleep(1)

            # Scroll to top
            js(driver, "window.scrollTo(0,0)")
            time.sleep(0.5)

            # Enter code and trigger check
            js(driver, f"""
                var input = document.getElementById('voucher-code-input');
                input.value = '{code}';
                input.dispatchEvent(new Event('input', {{bubbles: true}}));
                input.dispatchEvent(new KeyboardEvent('keydown', {{key: 'Enter', keyCode: 13, bubbles: true}}));
                input.dispatchEvent(new KeyboardEvent('keyup', {{key: 'Enter', keyCode: 13, bubbles: true}}));
            """)

            # Also try calling checkVoucher directly if auto-check doesn't trigger
            time.sleep(2)
            status = js_text(driver, "#claim-status")
            if not status or status == "":
                print("  Auto-check didn't trigger, calling checkVoucher directly...")
                js(driver, f"checkVoucher('{code}')")

            # Wait for result
            for i in range(15):
                time.sleep(2)
                status = js_text(driver, "#claim-status")
                if "Checking" not in status and status:
                    break

            screenshot(driver, "07_voucher_checked")

            status = js_text(driver, "#claim-status")
            badge = js_text(driver, "#voucher-status-badge")
            value = js_text(driver, "#voucher-value")
            asset = js_text(driver, "#voucher-asset-name")

            print(f"  Status: {status}")
            print(f"  Badge: {badge}")
            print(f"  Value: {value}")
            print(f"  Asset: {asset}")

            result_visible = js_display(driver, "#voucher-result")
            assert result_visible != "none", f"Result card not visible (display={result_visible})"
            assert "Available" in badge, f"Expected 'Available' badge, got '{badge}'"

        run_test("Check voucher", test_check_voucher)

        # ============================
        # TEST 5: Claim voucher
        # ============================
        def test_claim_voucher():
            # Click claim button
            btn_display = js_display(driver, "#btn-claim-voucher")
            print(f"  Claim button display: {btn_display}")
            assert btn_display != "none", "Claim button not visible"

            js_click(driver, "#btn-claim-voucher")
            print("  Waiting for claim (up to 120s)...")

            for i in range(24):
                time.sleep(5)
                badge = js_text(driver, "#voucher-status-badge")
                status = js_text(driver, "#claim-status")
                if "Claimed" in badge or "success" in status.lower() or "sent" in status.lower():
                    print(f"  Claimed after ~{(i+1)*5}s")
                    break

            screenshot(driver, "08_claimed")
            badge = js_text(driver, "#voucher-status-badge")
            status = js_text(driver, "#claim-status")
            print(f"  Badge: {badge}, Status: {status}")
            assert "Claimed" in badge or "success" in status.lower() or "sent" in status.lower(), \
                f"Claim not completed. Badge: {badge}, Status: {status}"

        run_test("Claim voucher", test_claim_voucher)

        # ============================
        # TEST 6: Already claimed shows correctly
        # ============================
        def test_already_claimed():
            codes = TEST_CODES or json.load(open("/tmp/airdrop_test_codes.json"))
            code = codes[0]

            # Wait for claim tx to confirm on-chain before re-checking
            normalized = ''.join(c for c in code.upper() if c.isalnum())
            code_hash = hashlib.sha256(normalized.encode()).hexdigest()
            print("  Waiting for claim tx to confirm on-chain...")
            import urllib.request
            for i in range(24):
                time.sleep(5)
                try:
                    req = urllib.request.Request(
                        'http://127.0.0.1:9080/api/wallet',
                        data=json.dumps({
                            "jsonrpc": "2.0", "id": 1,
                            "method": "invoke_contract",
                            "params": {
                                "args": f"role=user,action=check_voucher,cid=8737e0d39575d7015fdea259fa091e41fc293e6c3d54e80d529033c349b5b18e,hash={code_hash}",
                                "create_tx": False
                            }
                        }).encode(),
                        headers={"Content-Type": "application/json"}
                    )
                    resp = json.loads(urllib.request.urlopen(req).read())
                    output = json.loads(resp['result']['output'])
                    if output.get('voucher', {}).get('redeemed') == 1:
                        print(f"  Claim confirmed on-chain after ~{(i+1)*5}s")
                        break
                except:
                    pass

            # Re-check the same code
            js(driver, f"checkVoucher('{code}')")
            time.sleep(5)

            screenshot(driver, "09_already_claimed")
            badge = js_text(driver, "#voucher-status-badge")
            status = js_text(driver, "#claim-status")
            btn_display = js_display(driver, "#btn-claim-voucher")

            print(f"  Badge: {badge}, Status: {status}")
            print(f"  Claim button: {btn_display}")

            assert "Claimed" in badge, f"Expected 'Claimed', got '{badge}'"
            assert btn_display == "none", f"Claim button should be hidden, display={btn_display}"

        run_test("Already claimed shows correctly", test_already_claimed)

        # ============================
        # TEST 7: SECURITY - Hash cannot redeem
        # ============================
        def test_security_hash():
            codes = TEST_CODES or json.load(open("/tmp/airdrop_test_codes.json"))
            code = codes[1] if len(codes) > 1 else codes[0]

            normalized = ''.join(c for c in code.upper() if c.isalnum())
            hash_hex = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
            print(f"  Code: {code}")
            print(f"  Hash: {hash_hex}")

            # Try checking with hash
            js(driver, f"checkVoucher('{hash_hex}')")
            time.sleep(5)

            screenshot(driver, "10_hash_check")
            status = js_text(driver, "#claim-status")
            result_display = js_display(driver, "#voucher-result")
            badge = js_text(driver, "#voucher-status-badge")

            print(f"  Status: {status}")
            print(f"  Result card: {result_display}")

            # Hash should not find a voucher
            is_blocked = ("not found" in status.lower() or
                         result_display == "none" or
                         "error" in status.lower())
            assert is_blocked, f"SECURITY FAIL! Hash was accepted. Status: {status}, Badge: {badge}"
            print("  SECURITY PASSED: Hash cannot be used as code")

        run_test("SECURITY: Hash cannot redeem", test_security_hash)

        # ============================
        # TEST 8: Second voucher claim
        # ============================
        def test_second_voucher():
            codes = TEST_CODES or json.load(open("/tmp/airdrop_test_codes.json"))
            if len(codes) < 2:
                print("  SKIP: Only 1 code")
                return

            code = codes[1]
            print(f"  Checking code: {code}")

            js(driver, f"checkVoucher('{code}')")
            time.sleep(5)

            badge = js_text(driver, "#voucher-status-badge")
            print(f"  Badge: {badge}")
            screenshot(driver, "11_second_check")

            assert "Available" in badge, f"Expected 'Available', got '{badge}'"

            # Claim
            js_click(driver, "#btn-claim-voucher")
            print("  Waiting for second claim (up to 120s)...")

            for i in range(24):
                time.sleep(5)
                badge = js_text(driver, "#voucher-status-badge")
                if "Claimed" in badge:
                    print(f"  Claimed after ~{(i+1)*5}s")
                    break

            screenshot(driver, "12_second_claimed")
            badge = js_text(driver, "#voucher-status-badge")
            print(f"  Final badge: {badge}")
            assert "Claimed" in badge, f"Second claim not completed: {badge}"

        run_test("Claim second voucher", test_second_voucher)

        # ============================
        # TEST 9: Wrong code
        # ============================
        def test_wrong_code():
            js(driver, "checkVoucher('XXXXYYYY11112222')")
            time.sleep(5)

            status = js_text(driver, "#claim-status")
            print(f"  Status: {status}")
            screenshot(driver, "13_wrong_code")

            assert "not found" in status.lower() or "error" in status.lower(), \
                f"Expected 'not found', got '{status}'"

        run_test("Wrong code shows not found", test_wrong_code)

        # ============================
        # TEST 10: Updated stats
        # ============================
        def test_final_stats():
            # Reload page to get fresh stats
            js_click(driver, '.nav-item[data-page="dashboard"]')
            time.sleep(1)
            js_click(driver, '.nav-item[data-page="airdrop"]')
            time.sleep(3)

            batches = js_text(driver, "#airdrop-stat-batches")
            vouchers = js_text(driver, "#airdrop-stat-vouchers")
            claimed = js_text(driver, "#airdrop-stat-claimed")
            available = js_text(driver, "#airdrop-stat-available")

            print(f"  Final stats: batches={batches}, vouchers={vouchers}, claimed={claimed}, available={available}")
            screenshot(driver, "14_final_stats")

            assert int(claimed) > 0, f"Expected claimed > 0, got {claimed}"

        run_test("Final stats updated", test_final_stats)

    except Exception as e:
        screenshot(driver, "CRASH")
        print(f"\nCRASH: {e}")
        import traceback
        traceback.print_exc()

    finally:
        print(f"\n{'='*60}")
        print("TEST RESULTS")
        print(f"{'='*60}")
        passed = sum(1 for _, r in results if r == "PASS")
        failed = sum(1 for _, r in results if r != "PASS")
        for name, result in results:
            icon = "+" if result == "PASS" else "-"
            print(f"  [{icon}] {name}: {result}")
        print(f"\n  Total: {passed + failed} | Passed: {passed} | Failed: {failed}")
        print(f"  Screenshots: {SCREENSHOT_DIR}")

        driver.quit()
        try:
            os.remove("/tmp/airdrop_test_codes.json")
        except:
            pass
        sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
