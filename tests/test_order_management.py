#!/usr/bin/env python3
"""
P2P Order Management Tests
1. Create sell order
2. Create buy order
3. View my orders
4. Cancel order
5. Edit order (if supported)
"""

import time
import json
import urllib.request
import urllib.error
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import os

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots"

WALLETS = {
    "test_wallet": os.environ.get('BEAM_TEST_PASSWORD', ''),
    "test_2": "123123"
}

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def http_get(url):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except:
        return None

def http_post(url, data=None):
    try:
        body = json.dumps(data).encode() if data else b''
        req = urllib.request.Request(url, data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"HTTP error: {e}")
        return None

def get_active_wallet():
    data = http_get(f"{BASE_URL}/api/status")
    return data.get("active_wallet") if data else None

def switch_wallet(wallet_name):
    password = WALLETS[wallet_name]
    current = get_active_wallet()

    if current == wallet_name:
        print(f"Already on {wallet_name}")
        return True

    print(f"Switching to {wallet_name}...")
    http_post(f"{BASE_URL}/api/wallet/lock")
    time.sleep(1)

    data = http_post(f"{BASE_URL}/api/wallet/unlock", {"wallet": wallet_name, "password": password})
    if data and data.get("success"):
        print(f"Switched to {wallet_name}")
        return True
    print(f"Failed to switch: {data}")
    return False

def go_to_p2p(driver):
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)
    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            return True
    return False

def setup_payment_methods(driver):
    driver.execute_script("""
        const methods = {
            'bank_transfer': { id: 'bank_transfer', name: 'Bank Transfer', enabled: true, accountInfo: 'Test Bank Account\\nAccount: 1234567890\\nName: Test User' }
        };
        localStorage.setItem('p2p_payment_methods', JSON.stringify(methods));
    """)

def test_create_sell_order(driver):
    """Test creating a sell order"""
    print("\n" + "="*50)
    print("TEST: Create Sell Order")
    print("="*50)

    screenshot(driver, "order_01_market")

    # Click Create Order button
    clicked = driver.execute_script("""
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase().includes('create order') && b.offsetParent !== null);
        if (btn) { btn.click(); return true; }
        return false;
    """)

    if not clicked:
        print("Create Order button not found")
        return False

    print("Clicked Create Order")
    time.sleep(2)
    screenshot(driver, "order_02_create_modal")

    # Fill the form - small amount for testing
    driver.execute_script("""
        // Select FOMO asset (id 174)
        const assetSelect = document.getElementById('create-asset');
        if (assetSelect) assetSelect.value = '174';

        // Set amount: 0.1 FOMO
        const amountInput = document.getElementById('create-amount');
        if (amountInput) {
            amountInput.value = '0.1';
            amountInput.dispatchEvent(new Event('input'));
        }

        // Set price: $0.01 per FOMO
        const priceInput = document.getElementById('create-price');
        if (priceInput) {
            priceInput.value = '0.01';
            priceInput.dispatchEvent(new Event('input'));
        }

        // Set limits
        const minLimit = document.getElementById('create-min-limit');
        if (minLimit) minLimit.value = '0.01';

        const maxLimit = document.getElementById('create-max-limit');
        if (maxLimit) maxLimit.value = '10';

        // Check bank transfer payment method
        const bankCheck = document.querySelector('input[name="create-payment"][value="bank_transfer"]');
        if (bankCheck) bankCheck.checked = true;

        // Accept terms
        const terms = document.getElementById('create-terms');
        if (terms) terms.checked = true;
    """)

    print("Filled form: 0.1 FOMO at $0.01")
    time.sleep(1)
    screenshot(driver, "order_03_form_filled")

    # Click submit
    driver.execute_script("""
        const submitBtn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase().includes('create') &&
                      b.textContent.toLowerCase().includes('order') &&
                      b.classList.contains('btn-primary'));
        if (submitBtn) submitBtn.click();
    """)

    time.sleep(3)
    screenshot(driver, "order_04_confirmation")

    # Click confirm
    driver.execute_script("""
        const confirmBtn = document.querySelector('#tx-confirm-modal .btn-primary');
        if (confirmBtn) confirmBtn.click();
    """)

    time.sleep(5)
    screenshot(driver, "order_05_after_create")

    print("Order creation submitted")
    return True

def test_view_my_orders(driver):
    """Test viewing my orders"""
    print("\n" + "="*50)
    print("TEST: View My Orders")
    print("="*50)

    # Click My Trades button
    driver.execute_script("""
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase().includes('my trades'));
        if (btn) btn.click();
    """)

    time.sleep(2)
    screenshot(driver, "order_06_my_trades")

    # Click My Orders tab
    driver.execute_script("""
        const tab = Array.from(document.querySelectorAll('.trades-tab, button'))
            .find(b => b.textContent.toLowerCase().includes('my orders'));
        if (tab) tab.click();
    """)

    time.sleep(2)
    screenshot(driver, "order_07_my_orders")

    # Count orders
    order_count = driver.execute_script("""
        const orders = document.querySelectorAll('.order-card, .trade-card');
        return orders.length;
    """)

    print(f"Found {order_count} orders")
    return True

def test_cancel_order(driver):
    """Test canceling an order"""
    print("\n" + "="*50)
    print("TEST: Cancel Order")
    print("="*50)

    # Look for cancel button on own order
    clicked = driver.execute_script("""
        const cancelBtn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase().includes('cancel') &&
                      !b.textContent.toLowerCase().includes('trade') &&
                      b.offsetParent !== null);
        if (cancelBtn) { cancelBtn.click(); return true; }
        return false;
    """)

    if not clicked:
        print("No cancel button found - may need to create an order first")
        return False

    print("Clicked Cancel")
    time.sleep(2)
    screenshot(driver, "order_08_cancel_confirm")

    # Confirm cancellation
    driver.execute_script("""
        const confirmBtn = document.querySelector('#tx-confirm-modal .btn-primary, .btn-danger');
        if (confirmBtn) confirmBtn.click();
    """)

    time.sleep(5)
    screenshot(driver, "order_09_after_cancel")

    print("Order cancellation submitted")
    return True

def test_escrow_staking(driver):
    """Test escrow staking modal"""
    print("\n" + "="*50)
    print("TEST: Escrow Staking")
    print("="*50)

    # Close any open modals first
    driver.execute_script("document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));")
    time.sleep(1)

    # Click Escrow Staking button
    clicked = driver.execute_script("""
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase().includes('escrow') && b.offsetParent !== null);
        if (btn) { btn.click(); return true; }
        return false;
    """)

    if not clicked:
        print("Escrow Staking button not found")
        return False

    print("Clicked Escrow Staking")
    time.sleep(2)
    screenshot(driver, "order_10_escrow_modal")

    # Check escrow stats
    stats = driver.execute_script("""
        return {
            available: document.getElementById('escrow-available')?.textContent,
            totalStaked: document.getElementById('escrow-total-staked')?.textContent,
            stakers: document.getElementById('escrow-stakers')?.textContent,
            apy: document.getElementById('escrow-apy')?.textContent
        };
    """)

    print(f"Escrow Stats: {stats}")

    # Try staking a small amount
    driver.execute_script("""
        const amountInput = document.getElementById('escrow-stake-amount');
        if (amountInput) amountInput.value = '1';
    """)

    screenshot(driver, "order_11_escrow_filled")

    # Click stake button
    driver.execute_script("""
        const stakeBtn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase() === 'stake' && b.offsetParent !== null);
        if (stakeBtn) stakeBtn.click();
    """)

    time.sleep(3)
    screenshot(driver, "order_12_escrow_confirm")

    print("Escrow staking test complete")
    return True

def test_marketplace_stats(driver):
    """Test marketplace statistics"""
    print("\n" + "="*50)
    print("TEST: Marketplace Stats")
    print("="*50)

    # Close any open modals first
    driver.execute_script("document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));")
    time.sleep(1)

    # Look for stats button or link
    clicked = driver.execute_script("""
        const btn = Array.from(document.querySelectorAll('button, a'))
            .find(b => (b.textContent.toLowerCase().includes('stats') ||
                       b.textContent.toLowerCase().includes('statistics')) &&
                      b.offsetParent !== null);
        if (btn) { btn.click(); return true; }
        return false;
    """)

    if clicked:
        time.sleep(2)
        screenshot(driver, "order_13_stats_modal")
    else:
        print("Stats button not found")

    # Get visible stats from page
    stats = driver.execute_script("""
        const contractId = document.querySelector('.contract-id, [class*="contract"]')?.textContent;
        return { contractId };
    """)

    print(f"Contract info: {stats}")
    return True

def main():
    driver = connect()
    print("Connected to Chrome")

    try:
        # Switch to seller wallet
        if not switch_wallet("test_wallet"):
            print("Failed to switch wallet")
            return

        driver.get(f"{BASE_URL}/")
        time.sleep(2)

        if not go_to_p2p(driver):
            print("Failed to navigate to P2P")
            return

        time.sleep(2)
        setup_payment_methods(driver)

        # Run tests
        results = []

        # Test 1: Create sell order
        results.append(("Create Sell Order", test_create_sell_order(driver)))

        # Test 2: View my orders
        results.append(("View My Orders", test_view_my_orders(driver)))

        # Test 3: Escrow staking
        results.append(("Escrow Staking", test_escrow_staking(driver)))

        # Test 4: Marketplace stats
        results.append(("Marketplace Stats", test_marketplace_stats(driver)))

        # Print results
        print("\n" + "="*50)
        print("TEST RESULTS")
        print("="*50)
        for name, passed in results:
            status = "✓ PASS" if passed else "✗ FAIL"
            print(f"{status}: {name}")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        screenshot(driver, "order_error")

if __name__ == "__main__":
    main()
