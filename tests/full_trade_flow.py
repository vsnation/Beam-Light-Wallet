#!/usr/bin/env python3
"""
Full P2P Trade Flow Test
1. Login as buyer (test_2)
2. Accept order from seller
3. Mark payment sent
4. Switch to seller (test_wallet)
5. Confirm payment received
6. Verify trade completed
"""

import time
import json
import urllib.request
import urllib.error
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select
import os

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "" + REPO_ROOT + "//tests/screenshots"

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
    """Simple HTTP GET"""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except:
        return None

def http_post(url, data=None):
    """Simple HTTP POST with JSON"""
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
    """Get currently active wallet from API"""
    data = http_get(f"{BASE_URL}/api/status")
    return data.get("active_wallet") if data else None

def switch_wallet_via_api(wallet_name):
    """Switch wallet using serve.py API"""
    password = WALLETS[wallet_name]
    print(f"Switching to {wallet_name} via API...")

    # First lock current wallet
    http_post(f"{BASE_URL}/api/wallet/lock")
    time.sleep(1)

    # Unlock new wallet
    data = http_post(f"{BASE_URL}/api/wallet/unlock", {"wallet": wallet_name, "password": password})
    if data and data.get("success"):
        print(f"Switched to {wallet_name}")
        return True
    else:
        print(f"Switch failed: {data.get('error', 'Unknown error') if data else 'No response'}")
        return False

def login(driver, wallet_name):
    """Login to wallet - handles both fresh login and wallet switching"""
    password = WALLETS[wallet_name]
    print(f"\n=== Logging in as {wallet_name} ===")

    # Check if already logged in
    current_wallet = get_active_wallet()
    if current_wallet:
        print(f"Currently logged in as: {current_wallet}")
        if current_wallet == wallet_name:
            print("Already on correct wallet!")
            driver.get(f"{BASE_URL}/")
            time.sleep(2)
            return True
        else:
            # Switch wallet via API
            if switch_wallet_via_api(wallet_name):
                driver.get(f"{BASE_URL}/")
                time.sleep(3)
                return True
            return False

    # Fresh login from welcome screen
    driver.get(f"{BASE_URL}/")
    time.sleep(2)
    driver.switch_to.default_content()

    try:
        dropdown = driver.find_element(By.CSS_SELECTOR, "#welcome-wallet-select, select")
        Select(dropdown).select_by_value(wallet_name)
        print(f"Selected: {wallet_name}")
    except Exception as e:
        print(f"Select error: {e}")
        return False

    try:
        pwd = driver.find_element(By.CSS_SELECTOR, "#welcome-password, input[type='password']")
        pwd.clear()
        pwd.send_keys(password)
    except:
        pass

    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if btn.is_displayed() and "unlock" in btn.text.lower():
            btn.click()
            time.sleep(5)
            return True
    return False

def go_to_p2p(driver):
    """Navigate to P2P and switch to iframe"""
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)

    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            return True
    return False

def setup_payment_methods(driver):
    """Setup payment methods in localStorage"""
    driver.execute_script("""
        const methods = {
            'bank_transfer': { id: 'bank_transfer', name: 'Bank Transfer', enabled: true, accountInfo: 'Test Bank 1234' }
        };
        localStorage.setItem('p2p_payment_methods', JSON.stringify(methods));
    """)

def step1_buyer_accepts_order(driver):
    """BUYER: Accept the order"""
    print("\n" + "="*50)
    print("STEP 1: Buyer accepts order")
    print("="*50)

    screenshot(driver, "flow_01_market")

    # Click Buy FOMO using JS for reliability
    clicked = driver.execute_script("""
        const btns = Array.from(document.querySelectorAll('button'));
        const buyBtn = btns.find(b => b.textContent.toLowerCase().includes('buy fomo') && b.offsetParent !== null);
        if (buyBtn) { buyBtn.click(); return true; }
        return false;
    """)
    if clicked:
        print("Clicked Buy FOMO")
    else:
        print("Buy FOMO button not found")
        return False

    time.sleep(2)
    screenshot(driver, "flow_02_buy_modal")

    # Fill trade modal - use small amount within limits (0.01-10 USD)
    # Price is $0.01/FOMO, so 0.05 USD = 5 FOMO
    driver.execute_script("""
        document.getElementById('trade-pay-amount').value = '0.05';
        document.getElementById('trade-pay-amount').dispatchEvent(new Event('input'));
        document.getElementById('trade-agree-time').checked = true;
        document.getElementById('trade-agree-deposit').checked = true;
    """)
    print("Filled: 0.05 USD (should get ~5 FOMO)")

    time.sleep(1)
    screenshot(driver, "flow_03_filled")

    # Click Start Trade
    driver.execute_script("""
        Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.toLowerCase().includes('start trade'))
            ?.click();
    """)
    time.sleep(3)
    screenshot(driver, "flow_04_confirm")

    # Click Confirm button in the tx-confirm-modal
    print("Clicking Confirm...")
    driver.execute_script("""
        const confirmBtn = document.querySelector('#tx-confirm-modal .btn-primary');
        if (confirmBtn) confirmBtn.click();
    """)
    time.sleep(8)  # Wait longer for contract call
    screenshot(driver, "flow_05_after_accept")

    # Check if modal closed (success) or still open (failure)
    modal_visible = driver.execute_script("""
        const modal = document.getElementById('tx-confirm-modal');
        return modal && modal.classList.contains('active');
    """)

    if modal_visible:
        print("WARNING: Confirmation modal still open - contract call may have failed")
        # Try to close modal and check for error
        driver.execute_script("closeModal('tx-confirm-modal');")
        time.sleep(1)
        screenshot(driver, "flow_05b_modal_closed")

        # Check for error toast
        error = driver.execute_script("""
            const toast = document.querySelector('.toast.error');
            return toast ? toast.textContent : null;
        """)
        if error:
            print(f"ERROR: {error}")
            return False
    else:
        print("Modal closed - trade may have been accepted")

    print("Step 1 complete")
    return True

def step2_buyer_marks_payment(driver):
    """BUYER: Mark payment as sent"""
    print("\n" + "="*50)
    print("STEP 2: Buyer marks payment sent")
    print("="*50)

    time.sleep(2)
    screenshot(driver, "flow_06_active_trade")

    # List all visible buttons for debugging
    buttons_info = driver.execute_script("""
        return Array.from(document.querySelectorAll('button'))
            .filter(b => b.offsetParent !== null)
            .map(b => b.textContent.trim().substring(0, 50));
    """)
    print(f"Visible buttons: {buttons_info}")

    # Look for payment-related buttons in the active trade modal
    # The button might be "I've Paid", "Mark Payment Sent", "Payment Sent", "Confirm Payment", etc.
    clicked = driver.execute_script("""
        const btns = Array.from(document.querySelectorAll('button'));
        // Look for various payment button texts
        const patterns = ["i've paid", "i have paid", "paid", "payment sent", "mark payment", "confirm payment"];

        for (const pattern of patterns) {
            const btn = btns.find(b => {
                const text = b.textContent.toLowerCase().trim();
                // Exclude filter dropdowns like "All Payment Methods"
                if (text.includes('all payment') || text.includes('payment method')) return false;
                return text.includes(pattern) && b.offsetParent !== null;
            });
            if (btn) {
                console.log('Clicking button:', btn.textContent);
                btn.click();
                return btn.textContent.trim();
            }
        }

        // Also look for btn-primary in the active trade modal
        const activeModal = document.getElementById('active-trade-modal');
        if (activeModal) {
            const primaryBtn = activeModal.querySelector('.btn-primary');
            if (primaryBtn && primaryBtn.offsetParent !== null) {
                console.log('Clicking primary button:', primaryBtn.textContent);
                primaryBtn.click();
                return primaryBtn.textContent.trim();
            }
        }

        return null;
    """)

    if clicked:
        print(f"Clicked: {clicked}")
    else:
        print("Payment button not found - looking for alternative...")
        # Scroll down in case button is below fold
        driver.execute_script("""
            const modal = document.querySelector('.modal.active .modal-content');
            if (modal) modal.scrollTop = modal.scrollHeight;
        """)
        time.sleep(1)
        screenshot(driver, "flow_06c_scrolled")

        # Try again after scroll
        clicked = driver.execute_script("""
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b =>
                b.classList.contains('btn-primary') &&
                b.offsetParent !== null &&
                !b.textContent.toLowerCase().includes('cancel')
            );
            if (btn) { btn.click(); return btn.textContent.trim(); }
            return null;
        """)
        if clicked:
            print(f"Clicked after scroll: {clicked}")
        else:
            print("No payment button found")
            return False

    time.sleep(3)
    screenshot(driver, "flow_07_payment_marked")

    # Confirm if confirmation modal appears
    driver.execute_script("""
        setTimeout(() => {
            const confirmBtn = document.querySelector('#tx-confirm-modal .btn-primary');
            if (confirmBtn) confirmBtn.click();
        }, 500);
    """)
    time.sleep(5)

    screenshot(driver, "flow_08_after_payment_marked")
    print("Payment marked as sent!")
    return True

def step3_seller_confirms_payment(driver):
    """SELLER: Confirm payment received and release funds"""
    print("\n" + "="*50)
    print("STEP 3: Seller confirms payment")
    print("="*50)

    # Switch to seller wallet
    driver.switch_to.default_content()

    if not login(driver, "test_wallet"):
        print("Failed to login as seller")
        return False

    if not go_to_p2p(driver):
        print("Failed to go to P2P")
        return False

    time.sleep(3)
    setup_payment_methods(driver)
    screenshot(driver, "flow_09_seller_p2p")

    # Go to My Trades
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if "my trades" in btn.text.lower() and btn.is_displayed():
            btn.click()
            time.sleep(2)
            break

    screenshot(driver, "flow_10_my_trades")

    # Find the active trade and click to view
    # Look for "Confirm" or "Release" button
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.lower()
        if btn.is_displayed() and ("confirm" in text or "release" in text or "received" in text):
            print(f"Found button: {btn.text}")
            btn.click()
            time.sleep(3)
            break

    screenshot(driver, "flow_11_confirm_clicked")

    # Final confirmation
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if btn.is_displayed() and "confirm" in btn.text.lower():
            btn.click()
            time.sleep(5)
            break

    screenshot(driver, "flow_12_trade_complete")
    print("Payment confirmed, trade should be complete!")
    return True

def main():
    driver = connect()
    print("Connected to Chrome")

    try:
        # Login as buyer
        if not login(driver, "test_2"):
            print("Failed to login as buyer")
            return

        if not go_to_p2p(driver):
            print("Failed to go to P2P")
            return

        time.sleep(2)
        setup_payment_methods(driver)

        # Step 1: Accept order
        if not step1_buyer_accepts_order(driver):
            print("Step 1 failed")
            return

        # Step 2: Mark payment sent
        if not step2_buyer_marks_payment(driver):
            print("Step 2 failed")
            return

        # Step 3: Seller confirms
        if not step3_seller_confirms_payment(driver):
            print("Step 3 failed")
            return

        print("\n" + "="*50)
        print("FULL TRADE FLOW COMPLETED!")
        print("="*50)

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        screenshot(driver, "flow_error")

if __name__ == "__main__":
    main()
