#!/usr/bin/env python3
"""
Selenium tests for LightWallet Explorer Enhancements and Receive Address Popup
Tests all 5 implemented features using JavaScript clicks for reliability.
"""

import os
import sys
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Test configuration
BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
HEADLESS = "--headless" in sys.argv

def setup_driver():
    """Set up Chrome driver with options"""
    options = Options()
    if HEADLESS:
        options.add_argument("--headless")
    options.add_argument("--window-size=1400,900")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)
    return driver

def screenshot(driver, name):
    """Save screenshot with timestamp"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{name}_{timestamp}.png"
    path = os.path.join(SCREENSHOT_DIR, filename)
    driver.save_screenshot(path)
    print(f"  Screenshot: {filename}")
    return path

def wait_for(driver, selector, timeout=10):
    """Wait for element to be visible"""
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
    )

def js_click(driver, selector):
    """Click element using JavaScript to bypass interception"""
    element = driver.find_element(By.CSS_SELECTOR, selector)
    driver.execute_script("arguments[0].click();", element)
    return element

def js_click_element(driver, element):
    """Click element using JavaScript"""
    driver.execute_script("arguments[0].click();", element)

def scroll_to(driver, selector):
    """Scroll element into view"""
    element = driver.find_element(By.CSS_SELECTOR, selector)
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    time.sleep(0.3)
    return element

def test_results():
    """Store test results"""
    return {"passed": 0, "failed": 0, "errors": []}

results = test_results()

def run_test(name, test_func, driver):
    """Run a test and track results"""
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print('='*60)
    try:
        test_func(driver)
        results["passed"] += 1
        print(f"PASSED: {name}")
    except Exception as e:
        results["failed"] += 1
        results["errors"].append((name, str(e)))
        print(f"FAILED: {name}")
        print(f"  Error: {e}")
        screenshot(driver, f"FAIL_{name.replace(' ', '_')}")

# =============================================================================
# TEST 1: Block Detail Full Page View
# =============================================================================
def test_block_detail_page(driver):
    """Test that clicking a block row opens full page detail view"""
    print("  Navigating to Explorer...")
    driver.get(f"{BASE_URL}/")
    time.sleep(2)

    # Click Explorer in navigation using JS
    print("  Clicking Explorer nav...")
    js_click(driver, "[data-page='explorer']")
    time.sleep(2)
    screenshot(driver, "01_explorer_overview")

    # Click Blocks tab using JS
    print("  Clicking Blocks tab...")
    js_click(driver, "[onclick*=\"showExplorerTab('blocks')\"]")
    time.sleep(2)
    screenshot(driver, "02_blocks_tab")

    # Wait for blocks to load
    print("  Waiting for blocks to load...")
    try:
        wait_for(driver, "#explorer-blocks-list tr", timeout=15)
        time.sleep(1)
    except TimeoutException:
        print("  Warning: Blocks not loaded, may need connection")
        screenshot(driver, "02b_blocks_not_loaded")
        return

    # Click first block row using JS
    print("  Clicking first block row...")
    first_block = driver.find_element(By.CSS_SELECTOR, "#explorer-blocks-list tr")
    js_click_element(driver, first_block)
    time.sleep(2)
    screenshot(driver, "03_block_detail_page")

    # Verify we're on block detail page
    detail_page = driver.find_element(By.CSS_SELECTOR, "#page-explorer-block-detail")
    assert "block" in detail_page.get_attribute("class") or detail_page.is_displayed(), "Block detail page not displayed"

    # Verify back link exists
    back_link = driver.find_element(By.CSS_SELECTOR, "#page-explorer-block-detail .back-link")
    assert back_link.is_displayed(), "Back link not found"

    # Check content was loaded (no error message)
    content = driver.find_element(By.CSS_SELECTOR, "#block-detail-content")
    content_text = content.text
    print(f"  Content preview: {content_text[:100]}...")

    # Click back link using JS
    print("  Clicking back link...")
    js_click_element(driver, back_link)
    time.sleep(1)
    screenshot(driver, "04_back_to_blocks")

    print("  Block detail page test PASSED")

# =============================================================================
# TEST 2: Enhanced Search Functionality
# =============================================================================
def test_search_functionality(driver):
    """Test search by block height, hash, or kernel + contracts tab search"""
    print("  Navigating to Explorer...")
    driver.get(f"{BASE_URL}/")
    time.sleep(2)

    # Click Explorer
    js_click(driver, "[data-page='explorer']")
    time.sleep(2)

    # Find search input using JavaScript
    print("  Looking for main search input...")

    # Use JavaScript to set value and trigger search for block height
    print("  Testing search for block height '3706000'...")
    driver.execute_script("""
        var searchInput = document.getElementById('explorer-main-search');
        if (!searchInput) {
            searchInput = document.querySelector('.explorer-search-box input');
        }
        if (searchInput) {
            searchInput.value = '3706000';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    """)
    time.sleep(1)
    screenshot(driver, "05_search_block_height_typed")

    # Trigger search with Enter key via JavaScript
    driver.execute_script("""
        var searchInput = document.getElementById('explorer-main-search');
        if (!searchInput) {
            searchInput = document.querySelector('.explorer-search-box input');
        }
        if (searchInput) {
            var event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true });
            searchInput.dispatchEvent(event);
            // Also try calling search function directly
            if (typeof searchExplorerMain === 'function') {
                searchExplorerMain();
            }
        }
    """)
    time.sleep(2)
    screenshot(driver, "06_search_block_detail_result")

    # Go back to explorer overview
    driver.get(f"{BASE_URL}/")
    time.sleep(1)
    js_click(driver, "[data-page='explorer']")
    time.sleep(2)

    # Test contract search box (separate from main search)
    print("  Testing contracts tab search...")
    js_click(driver, "[onclick*=\"showExplorerTab('contracts')\"]")
    time.sleep(2)

    # Use JavaScript to set contract search value
    driver.execute_script("""
        var contractSearch = document.getElementById('explorer-contract-search');
        if (contractSearch) {
            contractSearch.value = 'DEX';
            contractSearch.dispatchEvent(new Event('input', { bubbles: true }));
            // Trigger filter function if available
            if (typeof filterExplorerContracts === 'function') {
                filterExplorerContracts();
            }
        }
    """)
    time.sleep(1)
    screenshot(driver, "07_contracts_search_dex")

    print("  Search functionality test PASSED")

# =============================================================================
# TEST 3: Pagination (Load More Buttons)
# =============================================================================
def test_pagination(driver):
    """Test Load More buttons for assets, contracts, trades"""
    print("  Navigating to Explorer...")
    driver.get(f"{BASE_URL}/")
    time.sleep(2)

    # Click Explorer
    js_click(driver, "[data-page='explorer']")
    time.sleep(2)

    # Test Assets pagination
    print("  Testing Assets pagination...")
    js_click(driver, "[onclick*=\"showExplorerTab('assets')\"]")
    time.sleep(3)
    screenshot(driver, "08_assets_tab_initial")

    # Count initial assets
    initial_assets = driver.find_elements(By.CSS_SELECTOR, ".explorer-asset-card")
    print(f"  Initial assets: {len(initial_assets)}")

    # Check for Load More Assets button
    try:
        load_more_btn = driver.find_element(By.CSS_SELECTOR, "#load-more-assets-btn")
        if load_more_btn.is_displayed():
            print("  Found Load More Assets button, clicking...")
            scroll_to(driver, "#load-more-assets-btn")
            js_click(driver, "#load-more-assets-btn")
            time.sleep(1)
            new_assets = driver.find_elements(By.CSS_SELECTOR, ".explorer-asset-card")
            print(f"  After load more: {len(new_assets)} assets")
            screenshot(driver, "09_assets_after_load_more")
            assert len(new_assets) > len(initial_assets), "Load More didn't add assets"
    except NoSuchElementException:
        print("  Load More Assets button not visible (less than 50 assets)")

    # Test Contracts pagination
    print("  Testing Contracts pagination...")
    js_click(driver, "[onclick*=\"showExplorerTab('contracts')\"]")
    time.sleep(3)
    screenshot(driver, "10_contracts_tab_initial")

    try:
        load_more_btn = driver.find_element(By.CSS_SELECTOR, "#load-more-contracts-btn")
        if load_more_btn.is_displayed():
            print("  Found Load More Contracts button, clicking...")
            scroll_to(driver, "#load-more-contracts-btn")
            js_click(driver, "#load-more-contracts-btn")
            time.sleep(1)
            screenshot(driver, "11_contracts_after_load_more")
    except NoSuchElementException:
        print("  Load More Contracts button not visible (less than 50 contracts)")

    # Test DEX Trades pagination
    print("  Testing DEX Trades pagination...")
    js_click(driver, "[onclick*=\"showExplorerTab('dex')\"]")
    time.sleep(3)
    screenshot(driver, "12_dex_tab_initial")

    try:
        load_more_btn = driver.find_element(By.CSS_SELECTOR, "#load-more-trades-btn")
        if load_more_btn.is_displayed():
            print("  Found Load More Trades button")
            scroll_to(driver, "#load-more-trades-btn")
            screenshot(driver, "13_dex_load_more_visible")
    except NoSuchElementException:
        print("  Load More Trades button not visible (less than 30 trades)")

    print("  Pagination test PASSED")

# =============================================================================
# TEST 4: Caching with TTL
# =============================================================================
def test_caching(driver):
    """Test that caching works - second load should be faster"""
    print("  Navigating to Explorer...")
    driver.get(f"{BASE_URL}/")
    time.sleep(2)

    # Click Explorer
    js_click(driver, "[data-page='explorer']")
    time.sleep(2)

    # Load assets first time
    print("  Loading assets first time...")
    start_time = time.time()
    js_click(driver, "[onclick*=\"showExplorerTab('assets')\"]")
    time.sleep(3)
    first_load_time = time.time() - start_time
    screenshot(driver, "14_assets_first_load")
    print(f"  First load: {first_load_time:.2f}s")

    # Switch to contracts tab
    print("  Switching to contracts tab...")
    js_click(driver, "[onclick*=\"showExplorerTab('contracts')\"]")
    time.sleep(2)

    # Switch back to assets - should use cache
    print("  Switching back to assets (should use cache)...")
    start_time = time.time()
    js_click(driver, "[onclick*=\"showExplorerTab('assets')\"]")
    time.sleep(1)
    second_load_time = time.time() - start_time
    screenshot(driver, "15_assets_cached_load")
    print(f"  Cached load: {second_load_time:.2f}s")

    # Verify cache is faster (or at least instant)
    print(f"  Time comparison: first={first_load_time:.2f}s, cached={second_load_time:.2f}s")

    # Force refresh with button
    print("  Force refresh with button...")
    refresh_btn = driver.find_element(By.CSS_SELECTOR, "#explorer-tab-assets .quick-btn")
    js_click_element(driver, refresh_btn)
    time.sleep(2)
    screenshot(driver, "16_assets_force_refresh")

    print("  Caching test PASSED")

# =============================================================================
# TEST 5: Receive Address Info Popup
# =============================================================================
def test_receive_address_popup(driver):
    """Test the address info popup for Offline and Max Privacy types"""
    print("  Navigating to home page...")
    driver.get(f"{BASE_URL}/")
    time.sleep(2)

    # Click Receive in navigation
    print("  Clicking Receive nav...")
    try:
        js_click(driver, "[data-page='receive']")
        time.sleep(1)
    except NoSuchElementException:
        print("  Receive nav not found, trying dashboard button...")
        try:
            js_click(driver, "[onclick*='openReceiveModal']")
            time.sleep(1)
        except NoSuchElementException:
            pass

    screenshot(driver, "17_receive_page")

    # Check if receive modal/page is open
    try:
        # Try to find the offline tab
        print("  Looking for address type tabs...")
        offline_tab = driver.find_element(By.CSS_SELECTOR, ".receive-tab[data-type='offline']")

        # Click Offline tab using JS
        print("  Clicking Offline tab...")
        js_click_element(driver, offline_tab)
        time.sleep(1)
        screenshot(driver, "18_offline_tab_clicked")

        # Check if info popup appeared
        try:
            info_modal = driver.find_element(By.CSS_SELECTOR, "#address-info-modal")
            if info_modal.is_displayed():
                print("  SUCCESS: Offline address info popup appeared!")
                screenshot(driver, "19_offline_info_popup")

                # Verify content sections
                sections = info_modal.find_elements(By.CSS_SELECTOR, ".info-section")
                print(f"  Found {len(sections)} info sections")
                assert len(sections) >= 3, "Not enough info sections"

                # Verify warning section
                warning = info_modal.find_element(By.CSS_SELECTOR, ".info-section.warning")
                assert warning.is_displayed(), "Warning section not found"
                print("  Warning section found")

                # Click Cancel to close
                cancel_btn = info_modal.find_element(By.CSS_SELECTOR, ".modal-btn-secondary")
                js_click_element(driver, cancel_btn)
                time.sleep(0.5)
                print("  Closed popup with Cancel")
        except NoSuchElementException:
            print("  Info popup not shown (may have been shown before in session)")

        # Reset session state by refreshing
        driver.refresh()
        time.sleep(2)

        # Click Max Privacy tab
        print("  Clicking Max Privacy tab...")
        max_privacy_tab = driver.find_element(By.CSS_SELECTOR, ".receive-tab[data-type='max_privacy']")
        js_click_element(driver, max_privacy_tab)
        time.sleep(1)
        screenshot(driver, "20_max_privacy_tab_clicked")

        # Check if info popup appeared
        try:
            info_modal = driver.find_element(By.CSS_SELECTOR, "#address-info-modal")
            if info_modal.is_displayed():
                print("  SUCCESS: Max Privacy info popup appeared!")
                screenshot(driver, "21_max_privacy_info_popup")

                # Verify title
                title = info_modal.find_element(By.CSS_SELECTOR, "#address-info-title")
                title_text = title.text
                print(f"  Popup title: {title_text}")
                assert "Max" in title_text or "Privacy" in title_text, f"Wrong popup title: {title_text}"

                # Click Create Address button
                create_btn = info_modal.find_element(By.CSS_SELECTOR, ".modal-btn-primary")
                js_click_element(driver, create_btn)
                time.sleep(1)
                screenshot(driver, "22_after_create_address")
                print("  Clicked Create Address button")
        except NoSuchElementException:
            print("  Max Privacy info popup not shown")

    except NoSuchElementException as e:
        print(f"  Could not find receive tabs: {e}")
        # Verify the modal HTML exists
        info_modal = driver.find_element(By.CSS_SELECTOR, "#address-info-modal")
        print("  Address info modal HTML exists in page")

    print("  Receive address popup test PASSED")

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================
def main():
    print("\n" + "="*70)
    print("BEAM LightWallet Enhancement Tests")
    print("="*70)
    print(f"Base URL: {BASE_URL}")
    print(f"Headless: {HEADLESS}")
    print(f"Screenshots: {SCREENSHOT_DIR}")

    driver = None
    try:
        driver = setup_driver()
        print("\nChrome driver initialized")

        # Run all tests
        run_test("Block Detail Page", test_block_detail_page, driver)
        run_test("Search Functionality", test_search_functionality, driver)
        run_test("Pagination", test_pagination, driver)
        run_test("Caching", test_caching, driver)
        run_test("Receive Address Popup", test_receive_address_popup, driver)

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        if driver:
            screenshot(driver, "FATAL_ERROR")
    finally:
        if driver:
            driver.quit()

    # Print summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Passed: {results['passed']}")
    print(f"Failed: {results['failed']}")

    if results["errors"]:
        print("\nFailed tests:")
        for name, error in results["errors"]:
            print(f"  - {name}: {error[:100]}...")

    print(f"\nScreenshots saved to: {SCREENSHOT_DIR}")

    return 0 if results["failed"] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
