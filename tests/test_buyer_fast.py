#!/usr/bin/env python3
"""Fast buyer flow test - Accept order #1"""

import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

BASE_URL = "http://127.0.0.1:9080"
BUYER_WALLET = "test_2"
BUYER_PASSWORD = "test_2"

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"{REPO_ROOT}/tests/screenshots/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def main():
    driver = connect()
    print(f"Connected, current URL: {driver.current_url}")

    # Step 1: Lock current wallet and unlock test_2
    print("\n=== Step 1: Switch to buyer wallet (test_2) ===")

    # Go to wallet main page
    driver.get(f"{BASE_URL}/wallet.html")
    time.sleep(2)
    screenshot(driver, "b01_initial")

    # Try to lock current wallet
    try:
        lock_btn = driver.find_element(By.CSS_SELECTOR, "#lockBtn, .lock-button, [onclick*='lock']")
        lock_btn.click()
        print("Clicked lock button")
        time.sleep(2)
    except Exception as e:
        print(f"Lock button not found: {e}")

    screenshot(driver, "b02_after_lock")

    # Select test_2 wallet
    try:
        # Find wallet dropdown
        wallet_select = driver.find_element(By.CSS_SELECTOR, "#wallet-select, select")
        wallet_select.click()
        time.sleep(0.5)

        # Select test_2
        options = wallet_select.find_elements(By.TAG_NAME, "option")
        for opt in options:
            if "test_2" in opt.text or opt.get_attribute("value") == "test_2":
                opt.click()
                print(f"Selected: {opt.text}")
                break
        time.sleep(0.5)
    except Exception as e:
        print(f"Error selecting wallet: {e}")

    # Enter password
    try:
        pwd = driver.find_element(By.CSS_SELECTOR, "#unlock-password, input[type='password']")
        pwd.clear()
        pwd.send_keys(BUYER_PASSWORD)
        print("Entered password")
    except Exception as e:
        print(f"Error entering password: {e}")

    screenshot(driver, "b03_password_entered")

    # Click unlock
    try:
        unlock_btn = driver.find_element(By.CSS_SELECTOR, "#unlock-btn, button[type='submit'], .btn-primary")
        unlock_btn.click()
        print("Clicked unlock")
        time.sleep(5)  # Wait for wallet API to start
    except Exception as e:
        print(f"Error clicking unlock: {e}")

    screenshot(driver, "b04_after_unlock")

    # Check if unlocked
    page_src = driver.page_source.lower()
    if "dashboard" in page_src or "balance" in page_src or "beam" in page_src:
        print("Wallet appears to be unlocked!")
    else:
        print("Wallet may not be unlocked, check screenshot")

    # Step 2: Setup payment methods for buyer
    print("\n=== Step 2: Setup payment methods ===")
    payment_data = {
        "bank_transfer": {"id": "bank_transfer", "name": "Bank Transfer", "enabled": True, "accountInfo": "Buyer Bank 9999"},
        "wise": {"id": "wise", "name": "Wise", "enabled": True, "accountInfo": "buyer@test.com"}
    }
    driver.execute_script(f"localStorage.setItem('p2p_payment_methods', JSON.stringify({json.dumps(payment_data)}));")
    print("Payment methods set")

    # Step 3: Navigate to P2P
    print("\n=== Step 3: Navigate to P2P ===")
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)
    screenshot(driver, "b05_p2p_page")

    # Switch to P2P iframe
    try:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        print(f"Found {len(iframes)} iframes")
        for iframe in iframes:
            src = iframe.get_attribute("src") or ""
            if "p2p" in src.lower():
                driver.switch_to.frame(iframe)
                print("Switched to P2P iframe")
                break
    except:
        print("No iframe switch needed")

    time.sleep(2)
    screenshot(driver, "b06_in_p2p")

    # Step 4: Find and click the order
    print("\n=== Step 4: Find order #1 ===")

    page_src = driver.page_source
    print(f"Contains 'order': {'order' in page_src.lower()}")
    print(f"Contains 'fomo': {'fomo' in page_src.lower()}")
    print(f"Contains 'buy': {'buy' in page_src.lower()}")

    # Look for Buy button or order card
    try:
        # Try finding the Buy button
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            text = btn.text.lower()
            if ('buy' in text or 'accept' in text) and btn.is_displayed():
                print(f"Found button: '{btn.text}'")
                btn.click()
                print("Clicked Buy/Accept button")
                time.sleep(2)
                screenshot(driver, "b07_after_buy_click")
                break
    except Exception as e:
        print(f"Error finding Buy button: {e}")

    # Step 5: Handle accept modal (if any)
    print("\n=== Step 5: Handle accept modal ===")
    screenshot(driver, "b08_modal")

    # Try to fill amount
    try:
        amount_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='number'], input[name='amount']")
        for inp in amount_inputs:
            if inp.is_displayed():
                inp.clear()
                inp.send_keys("0.03")
                print("Entered amount: 0.03")
                break
    except:
        pass

    # Click confirm
    try:
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            text = btn.text.lower()
            if btn.is_displayed() and ('confirm' in text or 'accept' in text or 'proceed' in text):
                btn.click()
                print(f"Clicked: {btn.text}")
                time.sleep(3)
                break
    except:
        pass

    screenshot(driver, "b09_after_confirm")

    # Step 6: Handle TX confirmation
    print("\n=== Step 6: TX Confirmation ===")
    try:
        # Look for modal with show class
        modals = driver.find_elements(By.CSS_SELECTOR, ".modal.show, .tx-modal, #txConfirmModal")
        for modal in modals:
            if modal.is_displayed():
                btns = modal.find_elements(By.TAG_NAME, "button")
                for btn in btns:
                    text = btn.text.lower()
                    if 'confirm' in text or 'sign' in text:
                        btn.click()
                        print(f"TX confirmed: {btn.text}")
                        time.sleep(3)
                        break
    except Exception as e:
        print(f"TX modal error: {e}")

    screenshot(driver, "b10_final")

    print("\n=== Test Complete ===")
    print("Check screenshots in tests/screenshots/")

if __name__ == "__main__":
    main()
