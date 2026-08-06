#!/usr/bin/env python3
"""Buy 0.5 FOMO from existing order using JS"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains

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

    # Go to P2P
    driver.get("http://127.0.0.1:9080/p2p")
    time.sleep(3)

    # Switch to iframe
    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            break

    time.sleep(2)
    screenshot(driver, "buy_01")

    # Find the Buy FOMO button in the order row and click
    print("=== Finding Buy FOMO button ===")
    buttons = driver.find_elements(By.TAG_NAME, "button")
    for btn in buttons:
        text = btn.text.strip()
        cls = btn.get_attribute("class") or ""
        if ("buy" in text.lower() and "fomo" in text.lower()) or "action-btn-primary" in cls:
            print(f"Found button: {text}, class: {cls}")
            if btn.is_displayed():
                # Use ActionChains for more reliable click
                ActionChains(driver).move_to_element(btn).click().perform()
                print("Clicked!")
                time.sleep(2)
                break

    screenshot(driver, "buy_02_clicked")

    # Check if trade modal opened
    page = driver.page_source
    if "trade-pay-amount" in page or "Start Trade" in page:
        print("Trade modal opened!")

        # Use JavaScript to set values
        driver.execute_script("""
            // Set pay amount to 0.5 USD (for 0.5 FOMO at $1/FOMO)
            document.getElementById('trade-pay-amount').value = '0.5';
            document.getElementById('trade-pay-amount').dispatchEvent(new Event('input'));

            // Check checkboxes
            document.getElementById('trade-agree-time').checked = true;
            document.getElementById('trade-agree-deposit').checked = true;
        """)
        print("Set values via JS")

        time.sleep(1)
        screenshot(driver, "buy_03_filled")

        # Click Start Trade
        for btn in driver.find_elements(By.TAG_NAME, "button"):
            if "start trade" in btn.text.lower() and btn.is_displayed():
                btn.click()
                print("Clicked Start Trade")
                break

        time.sleep(3)
        screenshot(driver, "buy_04_after")

        # Confirm TX
        for btn in driver.find_elements(By.TAG_NAME, "button"):
            if btn.is_displayed() and "confirm" in btn.text.lower():
                btn.click()
                print("Confirmed TX")
                time.sleep(5)
                break

        screenshot(driver, "buy_05_final")
    else:
        print("Trade modal did not open")
        # Save HTML for debug
        with open("" + REPO_ROOT + "//tests/screenshots/debug.html", "w") as f:
            f.write(driver.page_source)

    print("=== Done ===")

if __name__ == "__main__":
    main()
