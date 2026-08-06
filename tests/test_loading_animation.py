#!/usr/bin/env python3
"""
Test loading animation visibility
"""

import time
import json
import urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "" + REPO_ROOT + "//tests/screenshots"

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def http_post(url, data=None):
    try:
        body = json.dumps(data).encode() if data else b''
        req = urllib.request.Request(url, data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except:
        return None

def main():
    driver = connect()
    print("Connected to Chrome")

    # Navigate to P2P
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)

    # Switch to P2P iframe
    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            break

    # Trigger loading animation manually via JS with type parameter
    print("\nTesting blockchain confirmation animation...")
    driver.execute_script("""
        showTransactionLoading({
            title: 'Confirming Transaction',
            message: 'Broadcasting to BEAM blockchain...',
            countdown: 10,
            type: 'payment'
        });
    """)

    # Take screenshots every 2 seconds to capture animation
    for i in range(5):
        time.sleep(2)
        screenshot(driver, f"blockchain_confirmation_{i+1}")

        # Get countdown value using new element ID
        countdown = driver.execute_script("""
            return document.getElementById('bc-countdown-value')?.textContent;
        """)
        print(f"Countdown: {countdown}")

    # Hide loading
    driver.execute_script("hideTransactionLoading();")
    time.sleep(1)
    screenshot(driver, "blockchain_confirmation_hidden")

    print("\nBlockchain confirmation animation test complete!")

if __name__ == "__main__":
    main()
