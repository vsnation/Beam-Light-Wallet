#!/usr/bin/env python3
"""
P2P Test Utilities - Reusable methods for testing P2P smart contract
Wallet credentials:
  - test_wallet: $BEAM_TEST_PASSWORD (seller/manager)
  - test_2: 123123 (buyer)
"""

import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select
from selenium.webdriver.common.action_chains import ActionChains
import os

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots"

WALLETS = {
    "test_wallet": os.environ.get('BEAM_TEST_PASSWORD', ''),
    "test_2": "123123"
}

def connect_chrome():
    """Connect to existing Chrome debug session on port 9222"""
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    """Save screenshot"""
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")
    return path

def login_wallet(driver, wallet_name):
    """Login to specified wallet from welcome screen"""
    password = WALLETS.get(wallet_name)
    if not password:
        raise ValueError(f"Unknown wallet: {wallet_name}")

    print(f"\n=== Logging in as {wallet_name} ===")

    # Go to main page
    driver.get(f"{BASE_URL}/")
    time.sleep(2)
    driver.switch_to.default_content()

    # Select wallet from dropdown
    try:
        dropdown = driver.find_element(By.CSS_SELECTOR, "#welcome-wallet-select, select")
        select = Select(dropdown)
        select.select_by_value(wallet_name)
        print(f"Selected: {wallet_name}")
    except Exception as e:
        print(f"Error selecting wallet: {e}")
        return False

    # Enter password
    try:
        pwd = driver.find_element(By.CSS_SELECTOR, "#welcome-password, input[type='password']")
        pwd.clear()
        pwd.send_keys(password)
        print("Password entered")
    except Exception as e:
        print(f"Error entering password: {e}")
        return False

    # Click unlock
    try:
        for btn in driver.find_elements(By.TAG_NAME, "button"):
            if btn.is_displayed() and "unlock" in btn.text.lower():
                btn.click()
                print(f"Clicked: {btn.text}")
                time.sleep(5)  # Wait for wallet API
                return True
    except Exception as e:
        print(f"Error unlocking: {e}")

    return False

def go_to_p2p(driver):
    """Navigate to P2P page and switch to iframe"""
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)

    # Switch to P2P iframe
    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("Switched to P2P iframe")
            return True

    print("P2P iframe not found")
    return False

def setup_payment_methods(driver, methods=None):
    """Setup payment methods in localStorage"""
    if methods is None:
        methods = {
            "bank_transfer": {
                "id": "bank_transfer",
                "name": "Bank Transfer",
                "enabled": True,
                "accountInfo": "Test Bank Account 1234-5678"
            }
        }

    driver.execute_script(f"""
        localStorage.setItem('p2p_payment_methods', JSON.stringify({json.dumps(methods)}));
    """)
    print("Payment methods configured")

def click_buy_fomo(driver):
    """Click the Buy FOMO button in the order list"""
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip()
        if "buy fomo" in text.lower() and btn.is_displayed():
            ActionChains(driver).move_to_element(btn).click().perform()
            print(f"Clicked: {text}")
            time.sleep(2)
            return True

    print("Buy FOMO button not found")
    return False

def fill_trade_modal(driver, pay_amount):
    """Fill the trade modal with specified amount"""
    driver.execute_script(f"""
        document.getElementById('trade-pay-amount').value = '{pay_amount}';
        document.getElementById('trade-pay-amount').dispatchEvent(new Event('input'));
        document.getElementById('trade-agree-time').checked = true;
        document.getElementById('trade-agree-deposit').checked = true;
    """)
    print(f"Set pay amount: {pay_amount}")
    time.sleep(1)

def click_start_trade(driver):
    """Click Start Trade button"""
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if "start trade" in btn.text.lower() and btn.is_displayed():
            btn.click()
            print("Clicked Start Trade")
            time.sleep(3)
            return True

    print("Start Trade button not found")
    return False

def confirm_transaction(driver):
    """Click Confirm on transaction modal"""
    time.sleep(2)
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if btn.is_displayed() and "confirm" in btn.text.lower():
            btn.click()
            print("Confirmed transaction")
            time.sleep(5)
            return True

    print("No confirm button found")
    return False

def accept_order(driver, pay_amount="0.5"):
    """Full flow to accept an order as buyer"""
    if not click_buy_fomo(driver):
        return False

    fill_trade_modal(driver, pay_amount)
    screenshot(driver, "accept_modal_filled")

    if not click_start_trade(driver):
        return False

    screenshot(driver, "accept_after_start")
    return confirm_transaction(driver)

def create_sell_order(driver, amount, price, min_limit=0.01, max_limit=10):
    """Create a sell order (requires seller wallet)"""
    # Click Create Order button
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        if "create order" in btn.text.lower() and btn.is_displayed():
            btn.click()
            print("Clicked Create Order")
            time.sleep(2)
            break

    # Fill form via JS
    driver.execute_script(f"""
        document.getElementById('create-amount').value = '{amount}';
        document.getElementById('create-price').value = '{price}';
        document.getElementById('create-min-limit').value = '{min_limit}';
        document.getElementById('create-max-limit').value = '{max_limit}';

        // Select FOMO asset
        document.getElementById('create-asset').value = '174';

        // Check bank transfer payment method
        const bankCb = document.querySelector('input[name="create-payment"][value="bank_transfer"]');
        if (bankCb) bankCb.checked = true;

        // Accept terms
        document.getElementById('create-terms').checked = true;
    """)
    print(f"Filled order: {amount} FOMO at ${price}")
    time.sleep(1)

    # Click submit
    for btn in driver.find_elements(By.TAG_NAME, "button"):
        text = btn.text.lower()
        if btn.is_displayed() and ("create" in text and "order" in text):
            btn.click()
            print("Submitted order")
            time.sleep(3)
            break

    return confirm_transaction(driver)


# ============ Test Flows ============

def test_buyer_accepts_order():
    """Test: Buyer (test_2) accepts an existing order"""
    driver = connect_chrome()

    # Login as buyer
    if not login_wallet(driver, "test_2"):
        print("Failed to login as test_2")
        return False

    # Go to P2P
    if not go_to_p2p(driver):
        return False

    time.sleep(2)
    setup_payment_methods(driver)
    screenshot(driver, "buyer_p2p_loaded")

    # Accept order
    return accept_order(driver, pay_amount="0.5")


def test_seller_creates_order():
    """Test: Seller (test_wallet) creates a new order"""
    driver = connect_chrome()

    # Login as seller
    if not login_wallet(driver, "test_wallet"):
        print("Failed to login as test_wallet")
        return False

    # Go to P2P
    if not go_to_p2p(driver):
        return False

    time.sleep(2)
    setup_payment_methods(driver)
    screenshot(driver, "seller_p2p_loaded")

    # Create order
    return create_sell_order(driver, amount=0.1, price=1.0)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        test = sys.argv[1]
        if test == "buyer":
            test_buyer_accepts_order()
        elif test == "seller":
            test_seller_creates_order()
        else:
            print(f"Unknown test: {test}")
            print("Usage: python p2p_test_utils.py [buyer|seller]")
    else:
        print("P2P Test Utilities")
        print("Usage: python p2p_test_utils.py [buyer|seller]")
        print("\nAvailable tests:")
        print("  buyer  - Test buyer accepting an order")
        print("  seller - Test seller creating an order")
