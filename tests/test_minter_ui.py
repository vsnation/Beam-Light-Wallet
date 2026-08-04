#!/usr/bin/env python3
"""
Selenium test for Asset Minter UI
Tests the Create Token and Mint Token functionality
"""

import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://127.0.0.1:9080"

def test_minter_ui():
    """Test the Asset Minter UI functionality"""

    # Setup Chrome with debugging
    chrome_options = Options()
    chrome_options.add_argument("--window-size=1400,900")
    chrome_options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")

    try:
        driver = webdriver.Chrome(options=chrome_options)
        print("Connected to Chrome Debug session")
    except Exception as e:
        print(f"Could not connect to Chrome Debug session: {e}")
        print("Make sure Chrome is running with --remote-debugging-port=9222")
        return False

    wait = WebDriverWait(driver, 15)
    results = []

    try:
        # Navigate to wallet
        driver.get(BASE_URL)
        time.sleep(3)
        print(f"Page title: {driver.title}")

        # Check if we're on the wallet page or welcome screen
        page_source = driver.page_source
        if "welcome" in page_source.lower() or "unlock" in page_source.lower():
            print("On welcome/unlock screen - wallet needs to be unlocked first")
            results.append(("Page Load", "Need to unlock wallet first"))
        else:
            print("On wallet page")
            results.append(("Page Load", "PASS"))

        # Test 1: Navigate to Assets tab
        print("\n--- Test: Navigate to Assets Tab ---")
        try:
            # Click on Assets in navigation
            assets_nav = driver.find_element(By.CSS_SELECTOR, "[data-page='assets'], .nav-item[onclick*='assets']")
            assets_nav.click()
            time.sleep(2)

            # Check if assets page is visible
            assets_container = driver.find_element(By.CSS_SELECTOR, ".assets-grid, .asset-cards, #assets-list")
            print("Assets page loaded")
            results.append(("Assets Navigation", "PASS"))
        except Exception as e:
            print(f"Could not navigate to assets: {e}")
            results.append(("Assets Navigation", f"FAIL: {e}"))

        # Test 2: Check asset cards for created tokens
        print("\n--- Test: Check Asset Cards ---")
        try:
            asset_cards = driver.find_elements(By.CSS_SELECTOR, ".asset-card, .token-card")
            print(f"Found {len(asset_cards)} asset cards")

            # Look for our test assets (180, 181, 182)
            for card in asset_cards:
                card_text = card.text
                if "180" in card_text or "181" in card_text or "182" in card_text:
                    print(f"Found test asset card: {card_text[:50]}...")

            results.append(("Asset Cards", f"PASS - Found {len(asset_cards)} cards"))
        except Exception as e:
            print(f"Error checking asset cards: {e}")
            results.append(("Asset Cards", f"FAIL: {e}"))

        # Test 3: Check Create Token button
        print("\n--- Test: Create Token Button ---")
        try:
            create_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-btn, button[onclick*='openCreateTokenModal'], .create-asset-btn")
            print(f"Create Token button found: {create_btn.text}")
            results.append(("Create Token Button", "PASS"))

            # Click to open modal
            create_btn.click()
            time.sleep(1)

            # Check if modal opened
            modal = driver.find_element(By.CSS_SELECTOR, "#create-token-modal, .create-token-modal")
            if modal.is_displayed():
                print("Create Token modal opened")
                results.append(("Create Token Modal", "PASS"))

                # Check form fields
                name_input = driver.find_element(By.CSS_SELECTOR, "#ct-name")
                symbol_input = driver.find_element(By.CSS_SELECTOR, "#ct-symbol")
                supply_input = driver.find_element(By.CSS_SELECTOR, "#ct-supply")
                logo_input = driver.find_element(By.CSS_SELECTOR, "#ct-logo-url")

                print("Form fields found:")
                print(f"  Name input: {name_input.get_attribute('placeholder')}")
                print(f"  Symbol input: {symbol_input.get_attribute('placeholder')}")
                print(f"  Supply input: {supply_input.get_attribute('placeholder')}")

                # Check fee display (should be 50 BEAM now)
                fee_text = driver.find_element(By.CSS_SELECTOR, "#create-token-modal").text
                if "50 BEAM" in fee_text:
                    print("Fee correctly shows 50 BEAM")
                    results.append(("Fee Display", "PASS - Shows 50 BEAM"))
                elif "60 BEAM" in fee_text:
                    print("WARNING: Fee still shows 60 BEAM")
                    results.append(("Fee Display", "FAIL - Still shows 60 BEAM"))
                else:
                    results.append(("Fee Display", f"WARN - Fee text: {fee_text[:50]}"))

                # Close modal
                close_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-close, .close-modal")
                close_btn.click()
                time.sleep(0.5)
            else:
                results.append(("Create Token Modal", "FAIL - Modal not visible"))

        except Exception as e:
            print(f"Error with Create Token: {e}")
            results.append(("Create Token Button", f"FAIL: {e}"))

        # Test 4: Navigate to Transactions
        print("\n--- Test: Transactions Page ---")
        try:
            tx_nav = driver.find_element(By.CSS_SELECTOR, "[data-page='transactions'], .nav-item[onclick*='transactions']")
            tx_nav.click()
            time.sleep(2)

            # Check for transaction cards
            tx_cards = driver.find_elements(By.CSS_SELECTOR, ".tx-card, .transaction-item")
            print(f"Found {len(tx_cards)} transaction cards")

            # Look for our minter transactions
            page_text = driver.page_source
            found_create = "Create Asset" in page_text or "Creating asset" in page_text
            found_mint = "Mint Tokens" in page_text or "Minting asset" in page_text

            if found_create:
                print("Found Create Asset transaction")
            if found_mint:
                print("Found Mint Tokens transaction")

            results.append(("Transactions", f"PASS - {len(tx_cards)} cards, Create:{found_create}, Mint:{found_mint}"))
        except Exception as e:
            print(f"Error with Transactions: {e}")
            results.append(("Transactions", f"FAIL: {e}"))

        # Test 5: Check asset 182 with logo
        print("\n--- Test: Asset 182 (FMT) with Logo ---")
        try:
            # Go back to assets
            assets_nav = driver.find_element(By.CSS_SELECTOR, "[data-page='assets'], .nav-item[onclick*='assets']")
            assets_nav.click()
            time.sleep(2)

            # Look for asset 182 or FMT
            page_source = driver.page_source
            if "FMT" in page_source or "Full Metadata Test" in page_source:
                print("Found FMT token in assets list")
                results.append(("Asset 182 FMT", "PASS - Found in list"))
            else:
                print("FMT token not found - may need assets refresh")
                results.append(("Asset 182 FMT", "WARN - Not found, may need refresh"))

            # Check if logo is displayed
            logos = driver.find_elements(By.CSS_SELECTOR, "img[src*='litecoin'], img[src*='cryptologos']")
            if logos:
                print(f"Found {len(logos)} logo images from cryptologos.cc")
                results.append(("Logo Display", f"PASS - Found {len(logos)} logos"))
            else:
                results.append(("Logo Display", "WARN - No logos found"))

        except Exception as e:
            print(f"Error checking asset 182: {e}")
            results.append(("Asset 182 FMT", f"FAIL: {e}"))

        # Take screenshot
        driver.save_screenshot("/tmp/minter_test_result.png")
        print("\nScreenshot saved to /tmp/minter_test_result.png")

    except Exception as e:
        print(f"Test error: {e}")
        results.append(("Overall", f"FAIL: {e}"))

    # Print results
    print("\n" + "="*60)
    print("TEST RESULTS")
    print("="*60)
    for test_name, result in results:
        status = "✓" if "PASS" in result else ("⚠" if "WARN" in result else "✗")
        print(f"{status} {test_name}: {result}")

    return all("FAIL" not in r[1] for r in results)

if __name__ == "__main__":
    success = test_minter_ui()
    sys.exit(0 if success else 1)
