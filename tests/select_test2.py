#!/usr/bin/env python3
"""Select test_2 wallet in P2P UI - password: 123123"""

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

    # Navigate to P2P page
    driver.get("http://127.0.0.1:9080/p2p")
    time.sleep(2)

    # Switch to P2P iframe
    iframes = driver.find_elements(By.TAG_NAME, "iframe")
    for iframe in iframes:
        src = iframe.get_attribute("src") or ""
        if "p2p" in src.lower():
            driver.switch_to.frame(iframe)
            print("In P2P iframe")
            break

    time.sleep(1)
    screenshot(driver, "t2_01")

    # Find the account dropdown and select test_2
    try:
        selects = driver.find_elements(By.TAG_NAME, "select")
        print(f"Found {len(selects)} select elements")
        for sel in selects:
            options = sel.find_elements(By.TAG_NAME, "option")
            for opt in options:
                val = opt.get_attribute("value") or opt.text
                print(f"  Option: {opt.text}")
                if "test_2" in val:
                    sel.click()
                    time.sleep(0.3)
                    opt.click()
                    print(f"Selected: test_2")
                    break
    except Exception as e:
        print(f"Select error: {e}")

    time.sleep(0.5)

    # Enter password: 123123
    try:
        inputs = driver.find_elements(By.TAG_NAME, "input")
        for inp in inputs:
            inp_type = inp.get_attribute("type") or ""
            if "password" in inp_type.lower():
                inp.clear()
                inp.send_keys("123123")
                print("Entered password: 123123")
                break
    except Exception as e:
        print(f"Password error: {e}")

    screenshot(driver, "t2_02")

    # Click unlock button
    try:
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in buttons:
            if "unlock" in btn.text.lower():
                btn.click()
                print("Clicked UNLOCK")
                break
    except Exception as e:
        print(f"Unlock error: {e}")

    time.sleep(4)
    screenshot(driver, "t2_03_unlocked")

    # Verify unlocked
    page = driver.page_source.lower()
    if "order" in page or "market" in page:
        print("SUCCESS: P2P unlocked!")
    else:
        print("Check screenshot for status")

if __name__ == "__main__":
    main()
