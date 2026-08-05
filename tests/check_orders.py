#!/usr/bin/env python3
"""Check orders status in P2P"""

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

    # Close modal first by clicking Cancel
    try:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        for iframe in iframes:
            src = iframe.get_attribute("src") or ""
            if "p2p" in src.lower():
                driver.switch_to.frame(iframe)
                break

        # Click Cancel to close modal
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            if btn.is_displayed() and "cancel" in btn.text.lower():
                btn.click()
                print("Closed modal")
                break
    except:
        pass

    time.sleep(2)

    # Navigate to P2P fresh
    driver.switch_to.default_content()
    driver.get("http://127.0.0.1:9080/p2p")
    time.sleep(3)

    # Switch to iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            break

    time.sleep(2)
    screenshot(driver, "check_01_market")

    # Print page info
    print("\n=== Page content ===")
    page = driver.page_source

    # Look for order info
    if "642a4cde" in page:
        print("Found seller 642a4cde...")

    # Find all text that looks like amounts
    import re
    amounts = re.findall(r'(\d+\.?\d*)\s*(FOMO|BEAM|USD)', page)
    print(f"Amounts found: {amounts[:10]}")

    # Check buttons
    print("\n=== Buttons ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip()
        if text and btn.is_displayed():
            print(f"  {text}")

if __name__ == "__main__":
    main()
