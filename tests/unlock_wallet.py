#!/usr/bin/env python3
"""Unlock wallet in P2P - click dropdown, select wallet, enter password"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys

WALLET = "test_2"
PASSWORD = "123123"

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

    # Navigate to P2P
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

    time.sleep(1)
    screenshot(driver, "unlock_01")

    # Find the account input/dropdown (contains "FomoMinter" text)
    print("\n=== Finding account selector ===")

    # Try clicking on elements containing FomoMinter or Account text
    elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'FomoMinter') or contains(@value, 'FomoMinter')]")
    print(f"Found {len(elements)} elements with FomoMinter")

    for el in elements:
        tag = el.tag_name
        text = el.text or el.get_attribute("value") or ""
        print(f"  {tag}: {text[:30]}")
        if tag == "input":
            # This is the dropdown input - click it
            print("  -> Clicking input")
            el.click()
            time.sleep(1)
            screenshot(driver, "unlock_02_dropdown_open")

            # Now look for dropdown options
            options = driver.find_elements(By.CSS_SELECTOR, ".dropdown-item, .option, [data-value]")
            print(f"  Found {len(options)} dropdown items")
            for opt in options:
                opt_text = opt.text or opt.get_attribute("data-value") or ""
                print(f"    Option: {opt_text}")
                if WALLET.lower() in opt_text.lower():
                    opt.click()
                    print(f"    -> Selected {WALLET}")
                    break
            break

    time.sleep(1)
    screenshot(driver, "unlock_03_wallet_selected")

    # Find password input
    print("\n=== Entering password ===")
    pwd_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
    for pwd in pwd_inputs:
        if pwd.is_displayed():
            pwd.clear()
            pwd.send_keys(PASSWORD)
            print(f"Entered password: {PASSWORD}")
            break

    screenshot(driver, "unlock_04_password")

    # Click Unlock button
    print("\n=== Clicking Unlock ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        if btn.is_displayed() and "unlock" in btn.text.lower():
            btn.click()
            print(f"Clicked: {btn.text}")
            break

    time.sleep(5)  # Wait for wallet API to start
    screenshot(driver, "unlock_05_final")

    # Check if unlocked
    page = driver.page_source.lower()
    if "order" in page or "market" in page or "trade" in page:
        print("\n*** SUCCESS: P2P Unlocked! ***")
    elif "error" in page or "invalid" in page:
        print("\n*** ERROR: Check password ***")
    else:
        print("\n*** Status unclear - check screenshot ***")

if __name__ == "__main__":
    main()
