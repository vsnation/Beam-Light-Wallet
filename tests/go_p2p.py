#!/usr/bin/env python3
"""Navigate to P2P after login"""

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

    # Wait for wallet to fully load
    print("Waiting for wallet to load...")
    time.sleep(5)
    screenshot(driver, "p2p_00_before")

    # Navigate to P2P
    driver.get("http://127.0.0.1:9080/p2p")
    time.sleep(3)
    screenshot(driver, "p2p_01_loaded")

    # Switch to P2P iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("Switched to P2P iframe")
            break

    time.sleep(2)
    screenshot(driver, "p2p_02_iframe")

    # Check page content
    page = driver.page_source.lower()
    print(f"Contains 'order': {'order' in page}")
    print(f"Contains 'market': {'market' in page}")
    print(f"Contains 'buy': {'buy' in page}")

    # Find Buy buttons
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip()
        if text and btn.is_displayed():
            print(f"Button: {text}")

if __name__ == "__main__":
    main()
