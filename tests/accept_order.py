#!/usr/bin/env python3
"""Accept Order #1 - click Buy FOMO button"""

import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

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
    print(f"Connected, URL: {driver.current_url}")

    # Go to P2P
    driver.get("http://127.0.0.1:9080/p2p")
    time.sleep(3)

    # Switch to P2P iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("In P2P iframe")
            break

    time.sleep(2)
    screenshot(driver, "accept_01")

    # Setup payment methods first
    driver.execute_script("""
        const methods = {
            'bank_transfer': { id: 'bank_transfer', name: 'Bank Transfer', enabled: true, accountInfo: 'Buyer Bank 9999-8888' }
        };
        localStorage.setItem('p2p_payment_methods', JSON.stringify(methods));
    """)

    # Find and click "Buy FOMO" button
    print("\n=== Clicking Buy FOMO ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip()
        if "buy fomo" in text.lower() and btn.is_displayed():
            print(f"Found: {text}")
            btn.click()
            print("Clicked Buy FOMO")
            break

    time.sleep(2)
    screenshot(driver, "accept_02_modal")

    # Fill trade modal
    print("\n=== Filling trade modal ===")

    # Enter amount
    amount_inputs = driver.find_elements(By.CSS_SELECTOR, "#trade-pay-amount, #trade-receive-amount, input[type='number']")
    for inp in amount_inputs:
        if inp.is_displayed():
            inp_id = inp.get_attribute("id")
            print(f"Found input: {inp_id}")
            if "pay" in inp_id or not inp_id:
                inp.clear()
                inp.send_keys("0.01")
                print("Entered amount: 0.01")
                break

    time.sleep(1)
    screenshot(driver, "accept_03_amount")

    # Check agreement checkboxes
    checkboxes = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
    for cb in checkboxes:
        if cb.is_displayed() and not cb.is_selected():
            try:
                cb.click()
                print(f"Checked: {cb.get_attribute('id')}")
            except:
                pass

    screenshot(driver, "accept_04_checkboxes")

    # Click Accept/Start Trade button
    print("\n=== Clicking Accept Trade ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip().lower()
        if btn.is_displayed() and ("accept" in text or "start" in text or "confirm" in text):
            print(f"Found: {btn.text}")
            btn.click()
            print("Clicked accept")
            time.sleep(3)
            break

    screenshot(driver, "accept_05_after")

    # Handle TX confirmation if it appears
    print("\n=== TX Confirmation ===")
    time.sleep(2)
    modals = driver.find_elements(By.CSS_SELECTOR, ".modal.show, .tx-confirm-modal")
    for modal in modals:
        if modal.is_displayed():
            btns = modal.find_elements(By.TAG_NAME, "button")
            for btn in btns:
                if "confirm" in btn.text.lower():
                    btn.click()
                    print("TX confirmed")
                    time.sleep(3)
                    break

    screenshot(driver, "accept_06_final")
    print("\n=== Done ===")

if __name__ == "__main__":
    main()
