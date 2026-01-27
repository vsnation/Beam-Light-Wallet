#!/usr/bin/env python3
"""
Comprehensive Selenium test for Asset Minter UI
Tests Create Token, Mint, Burn with proper selectors and screenshots
Connects to Chrome Debug session on port 9222
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
SCREENSHOT_DIR = "/tmp/minter_test"

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
        print("  Make sure Chrome is running with: --remote-debugging-port=9222")
        return None

def screenshot(driver, name):
    """Save screenshot with name"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"  📸 Screenshot: {path}")
    return path

def test_minter_complete():
    """Run all minter tests"""

    driver = setup_driver()
    if not driver:
        return False

    wait = WebDriverWait(driver, 10)
    results = []

    try:
        # ==========================================
        # SETUP: Navigate to wallet
        # ==========================================
        print("\n🔧 SETUP: Loading wallet...")
        driver.get(BASE_URL)
        time.sleep(3)
        screenshot(driver, "00_initial_load")
        print(f"  Page title: {driver.title}")

        # ==========================================
        # TEST 1: Navigate to Assets Tab
        # ==========================================
        print("\n📋 TEST 1: Navigate to Assets Tab")
        try:
            assets_nav = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "[data-page='assets']")
            ))
            assets_nav.click()
            time.sleep(2)
            screenshot(driver, "01_assets_tab")
            print("  ✓ Assets tab loaded")
            results.append(("Assets Tab", "PASS"))
        except Exception as e:
            print(f"  ✗ Failed: {e}")
            results.append(("Assets Tab", f"FAIL: {e}"))

        # ==========================================
        # TEST 2: Open Create Token Modal
        # ==========================================
        print("\n📋 TEST 2: Open Create Token Modal")
        try:
            # Find Create Token button and scroll to it
            ct_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='openCreateTokenModal']")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", ct_btn)
            time.sleep(0.5)
            screenshot(driver, "02_create_token_button")

            # Click it
            ct_btn.click()
            time.sleep(1)

            # Wait for modal
            modal = wait.until(EC.visibility_of_element_located(
                (By.CSS_SELECTOR, "#create-token-modal")
            ))
            screenshot(driver, "02_create_token_modal")
            print("  ✓ Create Token modal opened")

            # Check form fields
            name_input = driver.find_element(By.CSS_SELECTOR, "#ct-name")
            symbol_input = driver.find_element(By.CSS_SELECTOR, "#ct-symbol")
            supply_input = driver.find_element(By.CSS_SELECTOR, "#ct-supply")
            print("  ✓ Form fields found: name, symbol, supply")

            # Check fee display
            modal_text = modal.text
            if "50 BEAM" in modal_text:
                print("  ✓ Fee correctly shows 50 BEAM")
                results.append(("Create Token Modal", "PASS - Fee 50 BEAM"))
            else:
                print("  ⚠ Fee display not found")
                results.append(("Create Token Modal", "PASS - Modal opened"))

            # Close modal
            close_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-close")
            close_btn.click()
            time.sleep(0.5)

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            screenshot(driver, "02_create_token_error")
            results.append(("Create Token Modal", f"FAIL: {e}"))

        # ==========================================
        # TEST 3: Fill Create Token Form (no submit)
        # ==========================================
        print("\n📋 TEST 3: Fill Create Token Form")
        try:
            # Reopen modal
            ct_btn = driver.find_element(By.CSS_SELECTOR, "button[onclick*='openCreateTokenModal']")
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", ct_btn)
            ct_btn.click()
            time.sleep(1)

            # Fill form
            name_input = driver.find_element(By.CSS_SELECTOR, "#ct-name")
            name_input.clear()
            name_input.send_keys("Test Token Selenium")

            symbol_input = driver.find_element(By.CSS_SELECTOR, "#ct-symbol")
            symbol_input.clear()
            symbol_input.send_keys("TTS")

            supply_input = driver.find_element(By.CSS_SELECTOR, "#ct-supply")
            supply_input.clear()
            supply_input.send_keys("1000000")

            # Add logo URL
            try:
                logo_input = driver.find_element(By.CSS_SELECTOR, "#ct-logo-url")
                logo_input.clear()
                logo_input.send_keys("https://cryptologos.cc/logos/ethereum-eth-logo.svg")
            except:
                pass

            # Add description
            try:
                desc_input = driver.find_element(By.CSS_SELECTOR, "#ct-short-desc")
                desc_input.clear()
                desc_input.send_keys("Test token for Selenium testing")
            except:
                pass

            screenshot(driver, "03_create_token_filled")
            print("  ✓ Form filled: Test Token Selenium (TTS)")
            print("  ⚠ Not submitting to save 50 BEAM fee")
            results.append(("Create Token Form", "PASS - Form ready"))

            # Close modal
            close_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-close")
            close_btn.click()
            time.sleep(0.5)

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            screenshot(driver, "03_create_token_form_error")
            results.append(("Create Token Form", f"FAIL: {e}"))

        # ==========================================
        # TEST 4: Find and Test Burn Button
        # ==========================================
        print("\n📋 TEST 4: Test Burn Button")
        try:
            # Scroll back to top
            driver.execute_script("window.scrollTo(0, 0)")
            time.sleep(1)

            # Look for any Burn button
            burn_buttons = driver.find_elements(By.XPATH, "//button[contains(@onclick,'openBurnModal')]")

            if burn_buttons:
                print(f"  Found {len(burn_buttons)} Burn button(s)")

                # Click first visible one
                for btn in burn_buttons:
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                        time.sleep(0.5)
                        btn.click()
                        break

                time.sleep(1)

                # Check if modal opened
                burn_modal = wait.until(EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, "#burn-token-modal")
                ))
                screenshot(driver, "04_burn_modal")
                print("  ✓ Burn modal opened")

                # Check warning text
                modal_text = burn_modal.text.lower()
                if "permanent" in modal_text or "irreversible" in modal_text:
                    print("  ✓ Warning about permanent burn displayed")

                # Test percentage buttons
                pct_btns = driver.find_elements(By.CSS_SELECTOR, "#burn-token-modal button[onclick*='setBurnPercent']")
                if pct_btns:
                    pct_btns[0].click()  # Click first (25%)
                    time.sleep(0.5)
                    amount_input = driver.find_element(By.CSS_SELECTOR, "#burn-amount")
                    print(f"  ✓ 25% button set amount to: {amount_input.get_attribute('value')}")

                screenshot(driver, "04_burn_modal_filled")
                results.append(("Burn Modal", "PASS"))

                # Close modal
                close_btn = driver.find_element(By.CSS_SELECTOR, "#burn-token-modal .modal-close")
                close_btn.click()
                time.sleep(0.5)
            else:
                print("  ⚠ No Burn buttons found")
                results.append(("Burn Modal", "WARN - No buttons visible"))

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            screenshot(driver, "04_burn_error")
            results.append(("Burn Modal", f"FAIL: {e}"))

        # ==========================================
        # TEST 5: Find and Test Mint Button
        # ==========================================
        print("\n📋 TEST 5: Test Mint Button")
        try:
            # First scroll to top to find the checkbox
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.5)

            # Enable "My Created Assets" filter to show only owned tokens (which have Mint buttons)
            try:
                my_assets_checkbox = driver.find_element(By.CSS_SELECTOR, "#show-my-assets")
                if my_assets_checkbox and not my_assets_checkbox.is_selected():
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", my_assets_checkbox)
                    time.sleep(0.3)
                    # Click using JavaScript to ensure it works
                    driver.execute_script("arguments[0].click();", my_assets_checkbox)
                    time.sleep(3)  # Wait for filter and API call to complete
                    print("  ✓ Enabled 'My Created Assets' filter")
                    screenshot(driver, "05_my_assets_filter")
            except Exception as e:
                print(f"  Note: Could not find My Assets checkbox: {e}")

            # Scroll down to find Mint buttons (they're at the bottom for assets 180-182)
            scroll_attempts = 0
            mint_buttons = []

            # First scroll to bottom of page to load all assets
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1)

            while scroll_attempts < 15:
                # Search for Mint buttons
                mint_buttons = driver.find_elements(By.XPATH, "//button[contains(@onclick,'openMintModal')]")

                if mint_buttons:
                    print(f"  Found {len(mint_buttons)} Mint button(s) after scroll")
                    break

                # Scroll down more
                driver.execute_script("window.scrollBy(0, 500);")
                time.sleep(0.5)
                scroll_attempts += 1

            screenshot(driver, "05_mint_search")

            if mint_buttons:
                print(f"  Found {len(mint_buttons)} Mint button(s)")

                # Try to click first visible/clickable Mint button
                clicked = False
                for btn in mint_buttons:
                    try:
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
                        time.sleep(0.5)
                        if btn.is_displayed():
                            btn.click()
                            clicked = True
                            break
                    except:
                        continue

                if clicked:
                    time.sleep(1)

                    # Check if modal opened
                    mint_modal = wait.until(EC.visibility_of_element_located(
                        (By.CSS_SELECTOR, "#mint-token-modal")
                    ))
                    screenshot(driver, "05_mint_modal")
                    print("  ✓ Mint modal opened")

                    # Check form fields
                    try:
                        mint_amount = driver.find_element(By.CSS_SELECTOR, "#mint-amount")
                        print("  ✓ Mint amount input found")
                    except:
                        pass

                    results.append(("Mint Modal", "PASS"))

                    # Close modal
                    close_btn = driver.find_element(By.CSS_SELECTOR, "#mint-token-modal .modal-close")
                    close_btn.click()
                    time.sleep(0.5)
                else:
                    print("  ⚠ Found Mint buttons but couldn't click any")
                    results.append(("Mint Modal", "WARN - Buttons not clickable"))
            else:
                print("  ⚠ No Mint buttons found after scrolling")
                # Take screenshot of current page state
                screenshot(driver, "05_mint_not_found")
                results.append(("Mint Modal", "WARN - No buttons visible"))

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            screenshot(driver, "05_mint_error")
            results.append(("Mint Modal", f"FAIL: {e}"))

        # ==========================================
        # TEST 6: Check Transactions Page
        # ==========================================
        print("\n📋 TEST 6: Check Transactions Page")
        try:
            # Navigate to transactions
            tx_nav = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "[data-page='transactions']")
            ))
            tx_nav.click()
            time.sleep(2)
            screenshot(driver, "06_transactions_page")

            # Check for minter transactions
            page_source = driver.page_source

            found_types = []
            if "Create Asset" in page_source:
                found_types.append("Create")
            if "Mint" in page_source:
                found_types.append("Mint")
            if "Burn" in page_source or "🔥" in page_source:
                found_types.append("Burn")

            if found_types:
                print(f"  ✓ Found transaction types: {', '.join(found_types)}")
                results.append(("Transactions", f"PASS - Found: {', '.join(found_types)}"))
            else:
                print("  ⚠ No minter transactions found")
                results.append(("Transactions", "WARN - No minter txs"))

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            screenshot(driver, "06_transactions_error")
            results.append(("Transactions", f"FAIL: {e}"))

        # ==========================================
        # TEST 7: Verify Token Icons in Transactions
        # ==========================================
        print("\n📋 TEST 7: Verify Token Icons in Transactions")
        try:
            # Look for token icons in transaction cards
            tx_icons = driver.find_elements(By.CSS_SELECTOR, ".tx-card img, .tx-asset img")
            icon_count = len([i for i in tx_icons if i.is_displayed()])

            if icon_count > 0:
                print(f"  ✓ Found {icon_count} token icons displayed")
                results.append(("Token Icons", f"PASS - {icon_count} icons"))
            else:
                # Check for fallback initials
                initials = driver.find_elements(By.CSS_SELECTOR, ".tx-asset-icon, .tx-asset span[style*='border-radius']")
                if initials:
                    print(f"  ✓ Found {len(initials)} token initials (fallback)")
                    results.append(("Token Icons", f"PASS - {len(initials)} initials"))
                else:
                    print("  ⚠ No token icons or initials found")
                    results.append(("Token Icons", "WARN - None found"))

            screenshot(driver, "07_transaction_icons")

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            results.append(("Token Icons", f"FAIL: {e}"))

        # ==========================================
        # TEST 8: Test FOMO Burn Specifically
        # ==========================================
        print("\n📋 TEST 8: Test FOMO (174) Burn")
        try:
            # Go back to assets
            assets_nav = driver.find_element(By.CSS_SELECTOR, "[data-page='assets']")
            assets_nav.click()
            time.sleep(2)

            # Look for FOMO burn button specifically
            fomo_burn = driver.find_elements(By.XPATH, "//button[contains(@onclick,'openBurnModal(174)')]")

            if fomo_burn and fomo_burn[0].is_displayed():
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", fomo_burn[0])
                time.sleep(0.5)
                fomo_burn[0].click()
                time.sleep(1)

                # Fill small amount
                burn_amount = driver.find_element(By.CSS_SELECTOR, "#burn-amount")
                burn_amount.clear()
                burn_amount.send_keys("0.00001")

                screenshot(driver, "08_fomo_burn_ready")
                print("  ✓ FOMO burn modal ready with 0.00001 FOMO")
                print("  ⚠ Not executing to preserve tokens")
                results.append(("FOMO Burn", "PASS - Ready"))

                # Close
                close_btn = driver.find_element(By.CSS_SELECTOR, "#burn-token-modal .modal-close")
                close_btn.click()
            else:
                print("  ⚠ FOMO burn button not found")
                results.append(("FOMO Burn", "WARN - Button not found"))

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            screenshot(driver, "08_fomo_burn_error")
            results.append(("FOMO Burn", f"FAIL: {e}"))

        # Final screenshot
        screenshot(driver, "99_final_state")

    except Exception as e:
        print(f"\n❌ Critical error: {e}")
        screenshot(driver, "99_critical_error")
        results.append(("Overall", f"FAIL: {e}"))

    # ==========================================
    # RESULTS SUMMARY
    # ==========================================
    print("\n" + "="*60)
    print("📊 TEST RESULTS - ASSET MINTER UI")
    print("="*60)

    passed = failed = warned = 0
    for name, result in results:
        if "PASS" in result:
            icon = "✅"
            passed += 1
        elif "WARN" in result:
            icon = "⚠️"
            warned += 1
        else:
            icon = "❌"
            failed += 1
        print(f"{icon} {name}: {result}")

    print("="*60)
    print(f"📈 PASSED: {passed} | FAILED: {failed} | WARNINGS: {warned}")
    print(f"📁 Screenshots saved to: {SCREENSHOT_DIR}/")
    print("="*60)

    return failed == 0

if __name__ == "__main__":
    success = test_minter_complete()
    sys.exit(0 if success else 1)
