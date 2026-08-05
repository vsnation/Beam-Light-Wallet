#!/usr/bin/env python3
"""Fix trade - enter amount within limits (0.000001 - 0.001 USD)"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def main():
    driver = connect()
    print(f"Connected, URL: {driver.current_url}")

    # Switch to P2P iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("In P2P iframe")
            break

    time.sleep(1)

    # Clear and enter correct amount (within limits 0.000001 - 0.001)
    print("\n=== Fixing amount ===")
    inp = driver.find_element(By.CSS_SELECTOR, "#trade-pay-amount")
    inp.clear()
    inp.send_keys("0.0005")  # Within limit
    print("Entered: 0.0005 USD")

    time.sleep(1)
    screenshot(driver, "fix_01_amount")

    # Make sure checkboxes are checked
    checkboxes = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
    for cb in checkboxes:
        if cb.is_displayed() and not cb.is_selected():
            cb.click()
            print(f"Checked: {cb.get_attribute('id')}")

    screenshot(driver, "fix_02_ready")

    # Click Start Trade
    print("\n=== Start Trade ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        if btn.is_displayed() and "start trade" in btn.text.lower():
            btn.click()
            print("Clicked Start Trade")
            break

    time.sleep(3)
    screenshot(driver, "fix_03_after")

    # Handle TX confirmation
    print("\n=== TX Confirmation ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.lower()
        if btn.is_displayed() and "confirm" in text:
            btn.click()
            print(f"Clicked: {btn.text}")
            time.sleep(5)
            break

    screenshot(driver, "fix_04_final")
    print("\n=== Done ===")

if __name__ == "__main__":
    main()
