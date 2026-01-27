#!/usr/bin/env python3
"""
Execute real Asset Minter transactions via Selenium
- Creates a new token (50 BEAM fee)
- Mints tokens on an owned asset
"""

import time
import sys
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "/tmp/minter_execute"

def setup_driver():
    """Connect to Chrome Debug session"""
    chrome_options = Options()
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("✓ Connected to Chrome Debug session")
        return driver
    except Exception as e:
        print(f"✗ Could not connect to Chrome: {e}")
        return None

def screenshot(driver, name):
    """Save screenshot"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"  📸 {path}")
    return path

def execute_transactions():
    """Execute Create Token and Mint transactions"""

    driver = setup_driver()
    if not driver:
        return False

    wait = WebDriverWait(driver, 15)
    results = []

    try:
        # Navigate to wallet
        print("\n🔧 Loading wallet...")
        driver.get(BASE_URL)
        time.sleep(3)

        # Go to Assets tab
        print("\n📋 Navigating to Assets...")
        assets_nav = wait.until(EC.element_to_be_clickable(
            (By.CSS_SELECTOR, "[data-page='assets']")
        ))
        assets_nav.click()
        time.sleep(2)

        # ==========================================
        # TRANSACTION 1: Create New Token (50 BEAM)
        # ==========================================
        print("\n" + "="*60)
        print("💰 TRANSACTION 1: CREATE NEW TOKEN (50 BEAM FEE)")
        print("="*60)

        try:
            # Scroll to top and find Create Token button
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.5)

            ct_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='openCreateTokenModal']")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", ct_btn)
            time.sleep(0.5)
            ct_btn.click()
            time.sleep(1)

            # Wait for modal
            modal = wait.until(EC.visibility_of_element_located(
                (By.CSS_SELECTOR, "#create-token-modal")
            ))
            print("  ✓ Create Token modal opened")

            # Fill form with unique token name
            timestamp = int(time.time())
            token_name = f"SeleniumToken{timestamp % 10000}"
            token_symbol = f"ST{timestamp % 1000}"

            name_input = driver.find_element(By.CSS_SELECTOR, "#ct-name")
            name_input.clear()
            name_input.send_keys(token_name)

            symbol_input = driver.find_element(By.CSS_SELECTOR, "#ct-symbol")
            symbol_input.clear()
            symbol_input.send_keys(token_symbol)

            supply_input = driver.find_element(By.CSS_SELECTOR, "#ct-supply")
            supply_input.clear()
            supply_input.send_keys("1000000")

            # Add logo URL
            try:
                logo_input = driver.find_element(By.CSS_SELECTOR, "#ct-logo-url")
                logo_input.clear()
                logo_input.send_keys("https://cryptologos.cc/logos/bitcoin-btc-logo.svg")
                print("  Logo: Bitcoin SVG")
            except:
                pass

            # Add description
            try:
                desc_input = driver.find_element(By.CSS_SELECTOR, "#ct-short-desc")
                desc_input.clear()
                desc_input.send_keys("Token created by Selenium test")
            except:
                pass

            screenshot(driver, "01_create_token_filled")
            print(f"  Token: {token_name} ({token_symbol})")
            print(f"  Supply: 1,000,000")
            print(f"  Fee: 50 BEAM")

            # Scroll down inside modal to see the submit button
            modal = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal")
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight;", modal)
            time.sleep(0.5)

            # Find and click submit button (ct-create-btn)
            submit_btn = driver.find_element(By.CSS_SELECTOR, "#ct-create-btn")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", submit_btn)
            time.sleep(0.3)
            screenshot(driver, "01b_create_token_button")
            print(f"  Clicking: {submit_btn.text}")
            submit_btn.click()

            # Wait for transaction to process
            print("  ⏳ Waiting for transaction...")
            time.sleep(5)

            screenshot(driver, "02_create_token_result")

            # Check for success toast or error
            page_text = driver.page_source
            if "success" in page_text.lower() or "created" in page_text.lower() or "pending" in page_text.lower():
                print("  ✓ Create Token transaction submitted!")
                results.append(("Create Token", "SUCCESS"))
            elif "error" in page_text.lower() or "failed" in page_text.lower():
                print("  ✗ Transaction failed")
                results.append(("Create Token", "FAILED"))
            else:
                print("  ? Transaction status unclear - check screenshot")
                results.append(("Create Token", "SUBMITTED"))

            # Close modal if still open
            try:
                driver.execute_script("closeModal('create-token-modal');")
                time.sleep(1)
            except:
                try:
                    close_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-close")
                    if close_btn.is_displayed():
                        close_btn.click()
                        time.sleep(0.5)
                except:
                    pass

        except Exception as e:
            print(f"  ✗ Create Token failed: {e}")
            screenshot(driver, "02_create_token_error")
            results.append(("Create Token", f"ERROR: {e}"))
            # Force close any open modal
            try:
                driver.execute_script("document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));")
                time.sleep(0.5)
            except:
                pass

        # ==========================================
        # TRANSACTION 2: Mint Tokens on Owned Asset
        # ==========================================
        print("\n" + "="*60)
        print("💰 TRANSACTION 2: MINT TOKENS")
        print("="*60)

        try:
            # First close any open modals
            driver.execute_script("document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));")
            time.sleep(1)

            # Enable My Created Assets filter to find owned tokens
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.5)

            my_assets_cb = driver.find_element(By.CSS_SELECTOR, "#show-my-assets")
            if not my_assets_cb.is_selected():
                driver.execute_script("arguments[0].click();", my_assets_cb)
                time.sleep(3)
                print("  ✓ Enabled My Created Assets filter")

            # Find a Mint button
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

            mint_buttons = driver.find_elements(By.XPATH, "//button[contains(@onclick,'openMintModal')]")

            if mint_buttons:
                print(f"  Found {len(mint_buttons)} Mint button(s)")

                # Click first mint button
                btn = mint_buttons[0]
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                time.sleep(0.5)
                btn.click()
                time.sleep(1)

                # Wait for mint modal
                mint_modal = wait.until(EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, "#mint-token-modal")
                ))
                print("  ✓ Mint modal opened")

                screenshot(driver, "03_mint_modal")

                # Get asset info from modal
                modal_text = mint_modal.text
                print(f"  Modal content: {modal_text[:100]}...")

                # Enter mint amount
                mint_amount = driver.find_element(By.CSS_SELECTOR, "#mint-amount")
                mint_amount.clear()
                mint_amount.send_keys("100")

                screenshot(driver, "04_mint_filled")
                print("  Amount: 100 tokens")

                # Click Mint button (correct ID is mint-btn)
                mint_submit = driver.find_element(By.CSS_SELECTOR, "#mint-btn")
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", mint_submit)
                time.sleep(0.3)
                print(f"  Clicking: {mint_submit.text}")
                mint_submit.click()

                # Wait for transaction
                print("  ⏳ Waiting for transaction...")
                time.sleep(5)

                screenshot(driver, "05_mint_result")

                # Check result
                page_text = driver.page_source
                if "success" in page_text.lower() or "minted" in page_text.lower() or "pending" in page_text.lower():
                    print("  ✓ Mint transaction submitted!")
                    results.append(("Mint Tokens", "SUCCESS"))
                elif "error" in page_text.lower() or "failed" in page_text.lower():
                    print("  ✗ Transaction failed")
                    results.append(("Mint Tokens", "FAILED"))
                else:
                    print("  ? Transaction status unclear")
                    results.append(("Mint Tokens", "SUBMITTED"))

                # Close modal
                try:
                    close_btn = driver.find_element(By.CSS_SELECTOR, "#mint-token-modal .modal-close")
                    if close_btn.is_displayed():
                        close_btn.click()
                except:
                    pass

            else:
                print("  ⚠ No Mint buttons found")
                results.append(("Mint Tokens", "SKIPPED - No buttons"))

        except Exception as e:
            print(f"  ✗ Mint failed: {e}")
            screenshot(driver, "05_mint_error")
            results.append(("Mint Tokens", f"ERROR: {e}"))

        # ==========================================
        # Check Transactions Page
        # ==========================================
        print("\n" + "="*60)
        print("📋 CHECKING TRANSACTIONS")
        print("="*60)

        try:
            tx_nav = driver.find_element(By.CSS_SELECTOR, "[data-page='transactions']")
            tx_nav.click()
            time.sleep(2)

            screenshot(driver, "06_transactions")

            page_source = driver.page_source
            if "Create" in page_source or "Mint" in page_source:
                print("  ✓ New transactions visible")

        except Exception as e:
            print(f"  Could not check transactions: {e}")

        # Final screenshot
        screenshot(driver, "99_final")

    except Exception as e:
        print(f"\n❌ Critical error: {e}")
        screenshot(driver, "99_error")
        results.append(("Overall", f"ERROR: {e}"))

    # Results summary
    print("\n" + "="*60)
    print("📊 TRANSACTION RESULTS")
    print("="*60)

    for name, result in results:
        if "SUCCESS" in result or "SUBMITTED" in result:
            icon = "✅"
        elif "SKIP" in result:
            icon = "⚠️"
        else:
            icon = "❌"
        print(f"{icon} {name}: {result}")

    print("="*60)
    print(f"📁 Screenshots: {SCREENSHOT_DIR}/")
    print("="*60)

    return True

if __name__ == "__main__":
    execute_transactions()
