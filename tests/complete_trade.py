#!/usr/bin/env python3
"""Complete the trade - click Start Trade and confirm TX"""

import time
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

    # Switch to P2P iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("In P2P iframe")
            break

    time.sleep(1)
    screenshot(driver, "trade_01")

    # Click Start Trade button
    print("\n=== Clicking Start Trade ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip()
        if btn.is_displayed() and "start trade" in text.lower():
            print(f"Found: {text}")
            btn.click()
            print("Clicked Start Trade")
            break

    time.sleep(3)
    screenshot(driver, "trade_02_after_start")

    # Handle TX confirmation modal
    print("\n=== Looking for TX confirmation ===")

    # Check for any modal with confirmation
    page = driver.page_source
    if "confirm" in page.lower() or "transaction" in page.lower():
        print("TX confirmation may be present")

    # Find confirm button
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip().lower()
        if btn.is_displayed() and ("confirm" in text or "sign" in text or "approve" in text):
            print(f"Found: {btn.text}")
            btn.click()
            print("Clicked confirm")
            time.sleep(5)
            break

    screenshot(driver, "trade_03_confirmed")

    # Check result
    print("\n=== Checking result ===")
    page = driver.page_source.lower()
    if "success" in page or "trade started" in page or "pending" in page:
        print("*** TRADE SUCCESS! ***")
    elif "error" in page or "failed" in page:
        print("*** TRADE FAILED ***")
    else:
        print("Check screenshot for status")

    screenshot(driver, "trade_04_final")

if __name__ == "__main__":
    main()
