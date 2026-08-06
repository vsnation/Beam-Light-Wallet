#!/usr/bin/env python3
"""Login to wallet - handles the unlock screen"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select
import os

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

# Wallet credentials
WALLETS = {
    "test_2": "123123",
    "test_wallet": os.environ.get('BEAM_TEST_PASSWORD', '')
}

BASE_URL = "http://127.0.0.1:9080"

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"{REPO_ROOT}/tests/screenshots/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def login(driver, wallet_name, password):
    """Login to specified wallet"""
    print(f"\n=== Logging in as {wallet_name} ===")

    # Go to main page (index.html)
    driver.get(f"{BASE_URL}/")
    time.sleep(2)
    driver.switch_to.default_content()
    screenshot(driver, f"login_01_{wallet_name}")

    # Find wallet dropdown
    dropdown = None
    for sel in ["#welcome-wallet-select", "select.welcome-select", "select"]:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    dropdown = el
                    break
            if dropdown:
                break
        except:
            pass

    if dropdown:
        select = Select(dropdown)
        print("Wallets:", [o.text for o in select.options])
        select.select_by_value(wallet_name)
        print(f"Selected: {wallet_name}")
        time.sleep(0.5)

    screenshot(driver, f"login_02_{wallet_name}")

    # Find password input
    for sel in ["#welcome-password", "input[type='password']"]:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, sel)
            for el in els:
                if el.is_displayed():
                    el.clear()
                    el.send_keys(password)
                    print("Password entered")
                    break
        except:
            pass

    screenshot(driver, f"login_03_{wallet_name}")

    # Click unlock button
    for sel in ["#welcome-unlock-btn", "button"]:
        try:
            btns = driver.find_elements(By.CSS_SELECTOR, sel)
            for btn in btns:
                if btn.is_displayed() and "unlock" in btn.text.lower():
                    btn.click()
                    print(f"Clicked: {btn.text}")
                    time.sleep(5)
                    screenshot(driver, f"login_04_{wallet_name}")
                    return True
        except:
            pass

    return False

def main():
    driver = connect()
    wallet = "test_2"
    password = WALLETS[wallet]

    if login(driver, wallet, password):
        page = driver.page_source.lower()
        if "dashboard" in page or "balance" in page:
            print(f"\n*** SUCCESS: Logged in as {wallet} ***")
        else:
            print(f"\n*** Check screenshot ***")
    else:
        print(f"\n*** Failed to find unlock button ***")

if __name__ == "__main__":
    main()
