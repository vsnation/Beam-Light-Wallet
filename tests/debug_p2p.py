#!/usr/bin/env python3
"""Debug P2P unlock page to find correct selectors"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def main():
    driver = connect()

    # Navigate to P2P
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

    # Get page HTML structure
    html = driver.page_source

    # Find all clickable elements
    print("\n=== INPUTS ===")
    inputs = driver.find_elements(By.TAG_NAME, "input")
    for i, inp in enumerate(inputs):
        print(f"{i}: type={inp.get_attribute('type')}, id={inp.get_attribute('id')}, class={inp.get_attribute('class')}, placeholder={inp.get_attribute('placeholder')}")

    print("\n=== SELECTS ===")
    selects = driver.find_elements(By.TAG_NAME, "select")
    for i, sel in enumerate(selects):
        print(f"{i}: id={sel.get_attribute('id')}, class={sel.get_attribute('class')}")

    print("\n=== DIVS with 'select' or 'dropdown' in class ===")
    divs = driver.find_elements(By.CSS_SELECTOR, "div[class*='select'], div[class*='dropdown'], div[class*='account']")
    for i, d in enumerate(divs):
        print(f"{i}: class={d.get_attribute('class')}, text={d.text[:50] if d.text else ''}")

    print("\n=== BUTTONS ===")
    btns = driver.find_elements(By.TAG_NAME, "button")
    for btn in btns:
        print(f"Button: {btn.text}, class={btn.get_attribute('class')}")

    # Try to find wallet/account selector by looking for text
    print("\n=== Looking for account dropdown ===")
    elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'FomoMinter') or contains(text(), 'Account') or contains(text(), 'test_')]")
    for el in elements:
        print(f"Found: tag={el.tag_name}, text={el.text[:50] if el.text else ''}, class={el.get_attribute('class')}")
        if el.tag_name in ['div', 'span', 'button']:
            print("  -> Trying to click this element...")
            try:
                el.click()
                time.sleep(1)
                # Check if dropdown opened
                opts = driver.find_elements(By.CSS_SELECTOR, ".dropdown-item, .option, li, [class*='option']")
                print(f"  -> Found {len(opts)} potential options after click")
                for opt in opts[:5]:
                    print(f"     Option: {opt.text}")
            except Exception as e:
                print(f"  -> Click failed: {e}")

if __name__ == "__main__":
    main()
