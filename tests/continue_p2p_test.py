#!/usr/bin/env python3
"""
Continue P2P Escrow Testing
Contract: 5f9c5c3ff019a8ffe67a032718cf53da7a6f4befa1945101c2c020ad49598a69

This script connects to existing Chrome debug session and continues trade flow testing.
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
from selenium.webdriver.common.action_chains import ActionChains

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

# Setup
SCREENSHOT_DIR = "" + REPO_ROOT + "//tests/screenshots/p2p_trade_flow"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def screenshot(driver, name):
    """Save screenshot with timestamp"""
    ts = datetime.now().strftime("%H%M%S")
    path = f"{SCREENSHOT_DIR}/{ts}_{name}.png"
    driver.save_screenshot(path)
    print(f"📸 Screenshot: {path}")
    return path

def connect_chrome():
    """Connect to existing Chrome debug session"""
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    driver = webdriver.Chrome(options=options)
    print(f"✅ Connected to Chrome: {driver.title}")
    return driver

def wait_for(driver, selector, timeout=10):
    """Wait for element to be visible"""
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
    )

def find_iframe(driver):
    """Find and switch to P2P iframe"""
    try:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for iframe in iframes:
            src = iframe.get_attribute("src") or ""
            if "p2p" in src:
                driver.switch_to.frame(iframe)
                print("✅ Switched to P2P iframe")
                return True
        print("❌ P2P iframe not found")
        return False
    except Exception as e:
        print(f"❌ Error finding iframe: {e}")
        return False

def test_current_state(driver):
    """Take screenshot of current state"""
    print("\n=== CURRENT STATE ===")
    screenshot(driver, "01_current_state")

    # Check if we're in iframe
    try:
        # Try to find P2P elements
        title = driver.find_element(By.CSS_SELECTOR, "h1, .page-title, .header-title")
        print(f"Page title: {title.text}")
    except:
        print("Not in P2P view, trying to find iframe...")
        driver.switch_to.default_content()
        if find_iframe(driver):
            screenshot(driver, "02_in_iframe")

def find_buy_modal(driver):
    """Check if Buy modal is open"""
    try:
        modal = driver.find_element(By.CSS_SELECTOR, ".modal, .trade-modal, [class*='modal']")
        if modal.is_displayed():
            print("✅ Modal is open")
            screenshot(driver, "03_modal_open")
            return modal
    except:
        pass
    print("❌ No modal open")
    return None

def enter_amount_in_modal(driver, amount="0.05"):
    """Enter amount in the trade modal"""
    print(f"\n=== ENTERING AMOUNT: {amount} ===")

    # Find amount input
    selectors = [
        "input[type='number']",
        "input[placeholder*='amount']",
        "input[placeholder*='Amount']",
        "#trade-amount",
        ".amount-input input",
        "input[name='amount']",
        ".trade-modal input",
        ".modal input[type='text']",
        ".modal input[type='number']"
    ]

    for selector in selectors:
        try:
            inputs = driver.find_elements(By.CSS_SELECTOR, selector)
            for inp in inputs:
                if inp.is_displayed():
                    print(f"Found input: {selector}")
                    # Clear and enter amount
                    inp.clear()
                    time.sleep(0.3)
                    inp.send_keys(amount)
                    time.sleep(0.5)
                    screenshot(driver, f"04_amount_entered_{amount}")
                    return True
        except Exception as e:
            continue

    print("❌ Could not find amount input")
    # Debug: print all inputs
    all_inputs = driver.find_elements(By.TAG_NAME, "input")
    print(f"Found {len(all_inputs)} inputs:")
    for i, inp in enumerate(all_inputs):
        print(f"  {i}: type={inp.get_attribute('type')}, placeholder={inp.get_attribute('placeholder')}, visible={inp.is_displayed()}")

    return False

def click_start_trade(driver):
    """Click Start Trade button"""
    print("\n=== CLICKING START TRADE ===")

    button_texts = ["Start Trade", "Start", "Buy", "Confirm", "Accept"]

    # Find buttons by text
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        if btn.is_displayed():
            text = btn.text.strip()
            for bt in button_texts:
                if bt.lower() in text.lower():
                    print(f"Found button: '{text}'")
                    screenshot(driver, "05_before_start_trade")
                    btn.click()
                    time.sleep(2)
                    screenshot(driver, "06_after_start_trade")
                    return True

    print("❌ Could not find Start Trade button")
    return False

def check_trade_result(driver):
    """Check if trade was started successfully"""
    print("\n=== CHECKING TRADE RESULT ===")
    time.sleep(3)
    screenshot(driver, "07_trade_result")

    # Look for success indicators
    success_indicators = [
        ".success", ".trade-active", "Payment", "trade started",
        ".toast-success", "Success"
    ]

    page_text = driver.page_source.lower()
    for indicator in success_indicators:
        if indicator.lower() in page_text:
            print(f"✅ Found success indicator: {indicator}")
            return True

    # Look for error indicators
    error_indicators = ["error", "failed", "not found", "rejected"]
    for indicator in error_indicators:
        if indicator in page_text:
            print(f"❌ Found error indicator: {indicator}")
            return False

    return None

def open_order_to_buy(driver):
    """Find and click on a sell order to open buy modal"""
    print("\n=== FINDING SELL ORDER ===")

    # Look for order rows
    order_selectors = [
        ".order-row", ".order-card", ".order-item",
        "[class*='order']", "tr[data-order-id]"
    ]

    for selector in order_selectors:
        try:
            orders = driver.find_elements(By.CSS_SELECTOR, selector)
            for order in orders:
                if order.is_displayed():
                    # Look for Buy button
                    buy_btns = order.find_elements(By.XPATH, ".//button[contains(text(), 'Buy')]")
                    if buy_btns:
                        print("Found order with Buy button")
                        screenshot(driver, "08_found_order")
                        buy_btns[0].click()
                        time.sleep(1)
                        screenshot(driver, "09_clicked_buy")
                        return True
        except:
            continue

    print("❌ No sell orders found")
    return False

def check_my_trades(driver):
    """Navigate to My Trades and check status"""
    print("\n=== CHECKING MY TRADES ===")

    # Try to find My Trades button
    try:
        my_trades_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'My Trades')]")
        my_trades_btn.click()
        time.sleep(2)
        screenshot(driver, "10_my_trades")
        return True
    except:
        print("Could not find My Trades button")
        return False

def main():
    """Main test flow"""
    print("=" * 60)
    print("P2P ESCROW TRADE FLOW TEST")
    print("Contract: 5f9c5c3ff019a8ffe67a032718cf53da7a6f4befa1945101c2c020ad49598a69")
    print("Active Wallet: test_2 (Buyer)")
    print("=" * 60)

    driver = connect_chrome()

    try:
        # Step 1: Check current state
        test_current_state(driver)

        # Step 2: Check if modal is already open
        modal = find_buy_modal(driver)

        if not modal:
            # Need to open a modal - find an order
            print("\n📋 Need to open order modal...")
            driver.switch_to.default_content()
            if find_iframe(driver):
                if not open_order_to_buy(driver):
                    print("❌ Cannot proceed without finding an order")
                    return
            time.sleep(1)

        # Step 3: Enter amount
        if not enter_amount_in_modal(driver, "0.05"):
            print("❌ Failed to enter amount")
            # Try clicking inside modal first
            try:
                modal_body = driver.find_element(By.CSS_SELECTOR, ".modal-body, .modal-content")
                modal_body.click()
                time.sleep(0.5)
                enter_amount_in_modal(driver, "0.05")
            except:
                pass

        # Step 4: Click Start Trade
        if click_start_trade(driver):
            # Step 5: Check result
            result = check_trade_result(driver)
            if result:
                print("\n✅ TRADE STARTED SUCCESSFULLY!")

                # Check My Trades
                check_my_trades(driver)
            else:
                print("\n❌ Trade may have failed - check screenshots")

        # Final screenshot
        screenshot(driver, "99_final_state")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        screenshot(driver, "error")
        raise
    finally:
        print("\n" + "=" * 60)
        print(f"Screenshots saved to: {SCREENSHOT_DIR}")
        print("=" * 60)

if __name__ == "__main__":
    main()
