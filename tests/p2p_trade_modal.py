#!/usr/bin/env python3
"""
P2P Trade Modal - Complete flow with checkboxes
"""

import time
import os
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

SCREENSHOT_DIR = "" + REPO_ROOT + "//tests/screenshots/p2p_trade_flow"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(driver, name):
    ts = datetime.now().strftime("%H%M%S")
    path = f"{SCREENSHOT_DIR}/{ts}_{name}.png"
    driver.save_screenshot(path)
    print(f"📸 {path}")
    return path

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    driver = webdriver.Chrome(options=options)
    print(f"✅ Connected: {driver.title}")
    return driver

def switch_to_p2p_iframe(driver):
    """Find and switch to P2P iframe"""
    driver.switch_to.default_content()
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("✅ Switched to P2P iframe")
            return True
    if iframes:
        driver.switch_to.frame(iframes[0])
        print("✅ Switched to first iframe")
        return True
    return False

def main():
    driver = connect()

    print("\n=== P2P TRADE - COMPLETE FLOW ===\n")
    screenshot(driver, "00_start")

    # Switch to P2P iframe
    if not switch_to_p2p_iframe(driver):
        print("❌ Could not find iframe")
        return

    time.sleep(0.5)

    # Step 1: Enter amount (0.01 USD minimum)
    print("\n[1] Entering amount: 0.01 USD")
    number_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='number']")
    visible_inputs = [inp for inp in number_inputs if inp.is_displayed()]

    if visible_inputs:
        amount_input = visible_inputs[0]  # First number input is USD amount
        driver.execute_script("arguments[0].value = '0.01';", amount_input)
        driver.execute_script("arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", amount_input)
        print("✅ Amount entered: 0.01")
        time.sleep(0.5)

    screenshot(driver, "01_amount")

    # Step 2: Check the checkboxes
    print("\n[2] Checking agreement checkboxes")
    checkboxes = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
    visible_checkboxes = [cb for cb in checkboxes if cb.is_displayed()]
    print(f"Found {len(visible_checkboxes)} visible checkboxes")

    for i, cb in enumerate(visible_checkboxes):
        try:
            is_checked = cb.is_selected()
            print(f"  Checkbox {i}: checked={is_checked}")
            if not is_checked:
                # Click the checkbox or its label
                try:
                    cb.click()
                    print(f"  ✅ Checked checkbox {i}")
                except:
                    # Try clicking parent/label
                    parent = cb.find_element(By.XPATH, "./..")
                    parent.click()
                    print(f"  ✅ Checked checkbox {i} via parent")
                time.sleep(0.3)
        except Exception as e:
            print(f"  ❌ Error with checkbox {i}: {e}")

    screenshot(driver, "02_checkboxes")

    # Step 3: Click Start Trade
    print("\n[3] Clicking Start Trade")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    start_btn = None
    for btn in buttons:
        if btn.is_displayed() and "Start Trade" in btn.text:
            start_btn = btn
            break

    if start_btn:
        screenshot(driver, "03_before_start")
        start_btn.click()
        print("✅ Clicked Start Trade")
        time.sleep(3)
        screenshot(driver, "04_after_start")
    else:
        print("❌ Start Trade button not found")
        return

    # Step 4: Handle confirmation modal (if appears)
    print("\n[4] Checking for confirmation modal")
    time.sleep(1)

    # Look for Confirm button
    confirm_btns = driver.find_elements(By.XPATH, "//button[contains(text(), 'Confirm')]")
    for btn in confirm_btns:
        if btn.is_displayed():
            print("Found Confirm button, clicking...")
            screenshot(driver, "05_confirm_modal")
            btn.click()
            time.sleep(5)
            screenshot(driver, "06_after_confirm")
            break

    # Step 5: Check trade result
    print("\n[5] Checking trade result")
    time.sleep(2)
    screenshot(driver, "07_result")

    # Look for trade status or active trade modal
    page_text = driver.find_element(By.TAG_NAME, "body").text

    if "I've Sent Payment" in page_text or "Mark Payment" in page_text:
        print("\n✅ TRADE STARTED! Showing payment step.")

        # Step 6: Mark Payment Sent
        print("\n[6] Marking payment as sent")
        payment_btns = driver.find_elements(By.XPATH, "//button[contains(text(), 'Payment') or contains(text(), 'Sent')]")
        for btn in payment_btns:
            if btn.is_displayed() and ("Sent" in btn.text or "Payment" in btn.text):
                print(f"Found button: '{btn.text}'")
                screenshot(driver, "08_before_payment")
                btn.click()
                time.sleep(3)
                screenshot(driver, "09_after_payment")
                break

    elif "error" in page_text.lower() or "failed" in page_text.lower():
        print("\n❌ Trade failed")
        # Find error message
        errors = driver.find_elements(By.CSS_SELECTOR, ".error, .toast-error, [class*='error']")
        for err in errors:
            if err.is_displayed():
                print(f"Error: {err.text}")

    elif "Order not found" in page_text:
        print("\n❌ Order not found error")

    else:
        print("\n⚠️  Unknown state - check screenshots")
        print(f"Page text sample: {page_text[:500]}")

    # Final screenshot
    screenshot(driver, "99_final")

    print("\n=== DONE ===")
    print(f"Screenshots: {SCREENSHOT_DIR}")

if __name__ == "__main__":
    main()
