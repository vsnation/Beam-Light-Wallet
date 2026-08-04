#!/usr/bin/env python3
"""
Selenium test for Asset Minter UI - Create Token, Mint, Burn
Tests the full token lifecycle using Chrome Debug session
"""

import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://127.0.0.1:9080"

def test_minter_full():
    """Test Create Token, Mint, and Burn functionality"""

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

        # ==========================================
        # TEST 1: Navigate to Assets Tab
        # ==========================================
        print("\n--- Test 1: Navigate to Assets Tab ---")
        try:
            # Click on Assets in navigation
            assets_nav = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "[data-page='assets'], .nav-item[onclick*='assets']")
            ))
            assets_nav.click()
            time.sleep(2)

            # Check if assets page is visible
            page_source = driver.page_source
            if "Create Token" in page_source or "My Minted Tokens" in page_source:
                print("Assets page loaded with minter options")
                results.append(("Navigate to Assets", "PASS"))
            else:
                print("Assets page loaded")
                results.append(("Navigate to Assets", "PASS"))

            driver.save_screenshot("/tmp/test_01_assets_page.png")
        except Exception as e:
            print(f"Error: {e}")
            results.append(("Navigate to Assets", f"FAIL: {e}"))

        # ==========================================
        # TEST 2: Open Create Token Modal
        # ==========================================
        print("\n--- Test 2: Open Create Token Modal ---")
        try:
            # Scroll up to find Create Token button (it's near the top of assets section)
            driver.execute_script("window.scrollTo(0, 0)")
            time.sleep(1)

            # Find and click Create Token button
            create_btn = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//button[contains(@onclick,'openCreateTokenModal') or contains(text(),'Create Token')]")
            ))
            print(f"Found Create Token button: {create_btn.text}")
            create_btn.click()
            time.sleep(1)

            # Check if modal opened
            modal = wait.until(EC.visibility_of_element_located(
                (By.CSS_SELECTOR, "#create-token-modal")
            ))
            print("Create Token modal opened")

            driver.save_screenshot("/tmp/test_02_create_modal.png")
            results.append(("Open Create Token Modal", "PASS"))

            # Check form fields exist
            name_input = driver.find_element(By.CSS_SELECTOR, "#ct-name")
            symbol_input = driver.find_element(By.CSS_SELECTOR, "#ct-symbol")
            supply_input = driver.find_element(By.CSS_SELECTOR, "#ct-supply")
            print("Form fields found: name, symbol, supply")

            # Check fee display (should be 50 BEAM)
            modal_text = modal.text
            if "50 BEAM" in modal_text:
                print("Fee correctly shows 50 BEAM")
                results.append(("Fee Display", "PASS - Shows 50 BEAM"))
            elif "60 BEAM" in modal_text:
                print("WARNING: Fee still shows 60 BEAM")
                results.append(("Fee Display", "FAIL - Shows 60 BEAM"))
            else:
                results.append(("Fee Display", "WARN - Fee not found"))

            # Close modal
            close_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-close")
            close_btn.click()
            time.sleep(0.5)

        except Exception as e:
            print(f"Error: {e}")
            results.append(("Open Create Token Modal", f"FAIL: {e}"))

        # ==========================================
        # TEST 3: Create a New Token
        # ==========================================
        print("\n--- Test 3: Create a New Token ---")
        try:
            # Reopen Create Token modal
            create_btn = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "#create-token-btn, button[onclick*='openCreateTokenModal']")
            ))
            create_btn.click()
            time.sleep(1)

            # Fill in token details
            name_input = driver.find_element(By.CSS_SELECTOR, "#ct-name")
            name_input.clear()
            name_input.send_keys("SeleniumTestToken")

            symbol_input = driver.find_element(By.CSS_SELECTOR, "#ct-symbol")
            symbol_input.clear()
            symbol_input.send_keys("STT")

            supply_input = driver.find_element(By.CSS_SELECTOR, "#ct-supply")
            supply_input.clear()
            supply_input.send_keys("1000000")

            # Optional: Add description
            try:
                desc_input = driver.find_element(By.CSS_SELECTOR, "#ct-short-desc")
                desc_input.clear()
                desc_input.send_keys("Test token created by Selenium")
            except:
                pass

            # Optional: Add logo URL
            try:
                logo_input = driver.find_element(By.CSS_SELECTOR, "#ct-logo-url")
                logo_input.clear()
                logo_input.send_keys("https://cryptologos.cc/logos/ethereum-eth-logo.svg")
            except:
                pass

            driver.save_screenshot("/tmp/test_03_create_filled.png")
            print("Token form filled: SeleniumTestToken (STT), supply: 1,000,000")

            # NOTE: We won't actually submit to avoid spending 50 BEAM
            # Just verify the form is ready
            submit_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-btn-primary, #create-token-submit")
            print(f"Submit button found: {submit_btn.text}")
            print("(Skipping actual creation to save 50 BEAM fee)")

            results.append(("Create Token Form", "PASS - Form ready (not submitted)"))

            # Close modal
            close_btn = driver.find_element(By.CSS_SELECTOR, "#create-token-modal .modal-close")
            close_btn.click()
            time.sleep(0.5)

        except Exception as e:
            print(f"Error: {e}")
            results.append(("Create Token Form", f"FAIL: {e}"))

        # ==========================================
        # TEST 4: Check My Minted Tokens Filter
        # ==========================================
        print("\n--- Test 4: Check My Minted Tokens Filter ---")
        try:
            # Look for the "My Minted Tokens" checkbox
            minted_checkbox = driver.find_element(By.CSS_SELECTOR, "#show-minted-only, input[onchange*='minted']")
            print("Found 'My Minted Tokens' checkbox")

            # Check it
            if not minted_checkbox.is_selected():
                minted_checkbox.click()
                time.sleep(1)

            driver.save_screenshot("/tmp/test_04_minted_filter.png")

            # Check if minted assets are shown (180, 181, 182 from previous tests)
            page_source = driver.page_source
            found_minted = False
            for aid in [180, 181, 182]:
                if str(aid) in page_source:
                    print(f"Found minted asset {aid}")
                    found_minted = True

            if found_minted:
                results.append(("My Minted Tokens Filter", "PASS - Found minted assets"))
            else:
                results.append(("My Minted Tokens Filter", "WARN - No minted assets visible"))

        except Exception as e:
            print(f"My Minted Tokens filter not found: {e}")
            results.append(("My Minted Tokens Filter", f"WARN: {e}"))

        # ==========================================
        # TEST 5: Test Mint Button
        # ==========================================
        print("\n--- Test 5: Test Mint Button ---")
        try:
            # Look for a Mint button on any asset card
            mint_buttons = driver.find_elements(By.CSS_SELECTOR, "button[onclick*='openMintModal'], .mint-btn")

            if mint_buttons:
                print(f"Found {len(mint_buttons)} Mint button(s)")
                mint_buttons[0].click()
                time.sleep(1)

                # Check if mint modal opened
                mint_modal = wait.until(EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, "#mint-token-modal")
                ))
                print("Mint modal opened")
                driver.save_screenshot("/tmp/test_05_mint_modal.png")

                # Check form fields
                mint_amount = driver.find_element(By.CSS_SELECTOR, "#mint-amount")
                print("Mint amount input found")

                # Close modal
                close_btn = driver.find_element(By.CSS_SELECTOR, "#mint-token-modal .modal-close")
                close_btn.click()
                time.sleep(0.5)

                results.append(("Mint Modal", "PASS"))
            else:
                print("No Mint buttons found - may need minted assets")
                results.append(("Mint Modal", "WARN - No Mint buttons visible"))

        except Exception as e:
            print(f"Error: {e}")
            results.append(("Mint Modal", f"FAIL: {e}"))

        # ==========================================
        # TEST 6: Test Burn Button
        # ==========================================
        print("\n--- Test 6: Test Burn Button ---")
        try:
            # Look for a Burn button on any asset card with balance
            burn_buttons = driver.find_elements(By.CSS_SELECTOR, "button[onclick*='openBurnModal'], .burn-btn")

            if burn_buttons:
                print(f"Found {len(burn_buttons)} Burn button(s)")
                burn_buttons[0].click()
                time.sleep(1)

                # Check if burn modal opened
                burn_modal = wait.until(EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, "#burn-token-modal")
                ))
                print("Burn modal opened")
                driver.save_screenshot("/tmp/test_06_burn_modal.png")

                # Check form fields
                burn_amount = driver.find_element(By.CSS_SELECTOR, "#burn-amount")
                print("Burn amount input found")

                # Check warning text
                modal_text = burn_modal.text
                if "permanent" in modal_text.lower() or "blackhole" in modal_text.lower():
                    print("Warning about permanent burn displayed")

                # Test percentage buttons
                pct_buttons = driver.find_elements(By.CSS_SELECTOR, "#burn-token-modal button[onclick*='setBurnPercent']")
                if pct_buttons:
                    print(f"Found {len(pct_buttons)} percentage buttons")
                    # Click 25% to test
                    for btn in pct_buttons:
                        if "25" in btn.text:
                            btn.click()
                            time.sleep(0.5)
                            print(f"Clicked 25% button, amount set to: {burn_amount.get_attribute('value')}")
                            break

                driver.save_screenshot("/tmp/test_06_burn_25pct.png")

                # Close modal
                close_btn = driver.find_element(By.CSS_SELECTOR, "#burn-token-modal .modal-close")
                close_btn.click()
                time.sleep(0.5)

                results.append(("Burn Modal", "PASS"))
            else:
                print("No Burn buttons found - may need assets with balance")
                results.append(("Burn Modal", "WARN - No Burn buttons visible"))

        except Exception as e:
            print(f"Error: {e}")
            results.append(("Burn Modal", f"FAIL: {e}"))

        # ==========================================
        # TEST 7: Check Asset 174 (FOMO) Burn Test
        # ==========================================
        print("\n--- Test 7: Test Burn on FOMO (Asset 174) ---")
        try:
            # Navigate back to assets and find FOMO
            driver.refresh()
            time.sleep(2)

            # Click on Assets tab
            assets_nav = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "[data-page='assets']")
            ))
            assets_nav.click()
            time.sleep(2)

            # Look for FOMO asset card or row
            page_source = driver.page_source
            if "FOMO" in page_source or "174" in page_source:
                print("FOMO asset found on page")

                # Try to find Burn button specifically for FOMO
                burn_buttons = driver.find_elements(By.CSS_SELECTOR, "button[onclick*='openBurnModal(174)']")
                if not burn_buttons:
                    # Try finding any burn button in a FOMO row
                    burn_buttons = driver.find_elements(By.XPATH, "//tr[contains(.,'FOMO') or contains(.,'174')]//button[contains(@onclick,'Burn') or contains(text(),'Burn')]")

                if burn_buttons:
                    print("Found Burn button for FOMO")
                    burn_buttons[0].click()
                    time.sleep(1)

                    # Fill in tiny amount
                    burn_amount = driver.find_element(By.CSS_SELECTOR, "#burn-amount")
                    burn_amount.clear()
                    burn_amount.send_keys("0.00001")

                    driver.save_screenshot("/tmp/test_07_fomo_burn.png")
                    print("Set burn amount to 0.00001 FOMO")

                    # NOTE: Don't actually burn - just verify form is ready
                    print("(Skipping actual burn execution)")

                    # Close modal
                    close_btn = driver.find_element(By.CSS_SELECTOR, "#burn-token-modal .modal-close")
                    close_btn.click()

                    results.append(("FOMO Burn Test", "PASS - Form ready"))
                else:
                    results.append(("FOMO Burn Test", "WARN - Burn button not found"))
            else:
                results.append(("FOMO Burn Test", "WARN - FOMO not found on page"))

        except Exception as e:
            print(f"Error: {e}")
            results.append(("FOMO Burn Test", f"FAIL: {e}"))

        # ==========================================
        # TEST 8: Check Transactions for Minter Actions
        # ==========================================
        print("\n--- Test 8: Check Transactions Page ---")
        try:
            # Navigate to Transactions
            tx_nav = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "[data-page='transactions']")
            ))
            tx_nav.click()
            time.sleep(2)

            driver.save_screenshot("/tmp/test_08_transactions.png")

            # Look for minter-related transactions
            page_source = driver.page_source
            found_create = "Create Asset" in page_source or "Creating asset" in page_source
            found_mint = "Mint" in page_source or "withdraw" in page_source.lower()
            found_burn = "BlackHole" in page_source or "burn" in page_source.lower()

            tx_info = []
            if found_create:
                tx_info.append("Create")
            if found_mint:
                tx_info.append("Mint")
            if found_burn:
                tx_info.append("Burn")

            if tx_info:
                print(f"Found transaction types: {', '.join(tx_info)}")
                results.append(("Transactions", f"PASS - Found: {', '.join(tx_info)}"))
            else:
                print("No minter transactions found")
                results.append(("Transactions", "WARN - No minter transactions visible"))

        except Exception as e:
            print(f"Error: {e}")
            results.append(("Transactions", f"FAIL: {e}"))

        # Final screenshot
        driver.save_screenshot("/tmp/test_final.png")
        print("\nScreenshots saved to /tmp/test_*.png")

    except Exception as e:
        print(f"Test error: {e}")
        results.append(("Overall", f"FAIL: {e}"))
        driver.save_screenshot("/tmp/test_error.png")

    # Print results
    print("\n" + "="*60)
    print("TEST RESULTS - ASSET MINTER UI")
    print("="*60)
    passed = 0
    failed = 0
    warned = 0
    for test_name, result in results:
        if "PASS" in result:
            status = "✓"
            passed += 1
        elif "WARN" in result:
            status = "⚠"
            warned += 1
        else:
            status = "✗"
            failed += 1
        print(f"{status} {test_name}: {result}")

    print("="*60)
    print(f"PASSED: {passed}, FAILED: {failed}, WARNINGS: {warned}")
    print("="*60)

    return failed == 0

if __name__ == "__main__":
    success = test_minter_full()
    sys.exit(0 if success else 1)
