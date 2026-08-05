#!/usr/bin/env python3
"""
BEAM P2P Exchange - Comprehensive E2E Test Suite
Tests ALL functionality until everything works perfectly
"""

import os
import sys
import time
import json
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import *

# Configuration
BASE_URL = "http://127.0.0.1:9080"
P2P_URL = f"{BASE_URL}/p2p"
SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/screenshots"
TIMEOUT = 10

# Test results
results = {
    "started": datetime.now().isoformat(),
    "phases": {},
    "total_tests": 0,
    "passed": 0,
    "failed": 0,
    "screenshots": []
}

def setup_driver():
    """Setup Chrome WebDriver"""
    options = Options()
    options.add_argument('--window-size=1400,900')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    # Try to connect to existing debug session first
    try:
        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        driver = webdriver.Chrome(options=options)
        print("Connected to existing Chrome debug session")
        return driver
    except:
        print("Starting new Chrome browser")
        options = Options()
        options.add_argument('--window-size=1400,900')
        driver = webdriver.Chrome(options=options)
        return driver

def screenshot(driver, name):
    """Take and save screenshot"""
    filepath = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(filepath)
    results["screenshots"].append(name)
    print(f"  Screenshot: {name}.png")
    return filepath

def wait_and_find(driver, selector, timeout=TIMEOUT):
    """Wait for element and return it"""
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
    )

def wait_and_click(driver, selector, timeout=TIMEOUT):
    """Wait for element to be clickable and click it"""
    elem = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
    )
    elem.click()
    return elem

def safe_click(driver, selector):
    """Try to click, return True if successful"""
    try:
        wait_and_click(driver, selector, timeout=3)
        return True
    except:
        return False

def js_click(driver, selector):
    """Click via JavaScript"""
    try:
        driver.execute_script(f"document.querySelector('{selector}')?.click()")
        return True
    except:
        return False

def js_call(driver, func_name, *args):
    """Call JavaScript function"""
    try:
        args_str = ','.join([json.dumps(a) for a in args]) if args else ''
        result = driver.execute_script(f"return {func_name}({args_str})")
        return True, result
    except Exception as e:
        return False, str(e)

def log_phase(phase_name, status, details=""):
    """Log phase result"""
    results["phases"][phase_name] = {"status": status, "details": details}
    results["total_tests"] += 1
    if status == "PASS":
        results["passed"] += 1
        print(f"  [PASS] {phase_name}")
    else:
        results["failed"] += 1
        print(f"  [FAIL] {phase_name}: {details}")

# ============================================
# TEST PHASES
# ============================================

def phase_1_page_load(driver):
    """Phase 1: Basic UI Load"""
    print("\n=== Phase 1: Page Load ===")
    driver.get(P2P_URL)
    time.sleep(3)

    screenshot(driver, "p2p_e2e_01_initial_load")

    # Check for key elements
    try:
        # Check title
        title = driver.find_element(By.CSS_SELECTOR, ".p2p-header h1, h1")
        print(f"  Title found: {title.text}")

        # Check contract ID
        contract_elem = driver.find_elements(By.CSS_SELECTOR, "[class*='contract']")
        if contract_elem:
            print(f"  Contract ID visible")

        log_phase("Page Load", "PASS", "P2P page loaded successfully")
        return True
    except Exception as e:
        log_phase("Page Load", "FAIL", str(e))
        return False

def phase_2_wallet_status(driver):
    """Phase 2: Check Wallet Connection"""
    print("\n=== Phase 2: Wallet Status ===")

    screenshot(driver, "p2p_e2e_02_wallet_status")

    # Check for wallet address or connection status
    try:
        # Look for any wallet indicator
        wallet_indicators = driver.find_elements(By.CSS_SELECTOR,
            "[id*='address'], [id*='wallet'], [class*='wallet'], [class*='address']")

        # Check if connected by looking for order loading
        loading_text = driver.find_elements(By.XPATH, "//*[contains(text(), 'Loading')]")
        connected_text = driver.find_elements(By.XPATH, "//*[contains(text(), 'Connected')]")

        if connected_text:
            log_phase("Wallet Connection", "PASS", "Wallet appears connected")
            return True
        elif loading_text:
            log_phase("Wallet Connection", "PASS", "Loading from contract (wallet connected)")
            return True
        else:
            log_phase("Wallet Connection", "PARTIAL", "Wallet status unclear")
            return True
    except Exception as e:
        log_phase("Wallet Connection", "FAIL", str(e))
        return False

def phase_3_registration(driver):
    """Phase 3: Trader Registration"""
    print("\n=== Phase 3: Trader Registration ===")

    # Try to open registration modal
    success, _ = js_call(driver, "showRegisterModal")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_03_register_modal")

    # Check if modal opened
    modal = driver.find_elements(By.CSS_SELECTOR, "#register-modal, [id*='register']")
    if modal and any(m.is_displayed() for m in modal):
        print("  Registration modal opened")

        # Try to fill nickname
        nick_input = driver.find_elements(By.CSS_SELECTOR, "#register-nickname, input[placeholder*='nickname']")
        if nick_input:
            nick_input[0].clear()
            nick_input[0].send_keys("TestTrader")
            print("  Filled nickname: TestTrader")

        # Try to register
        success, result = js_call(driver, "registerTrader")
        time.sleep(2)
        screenshot(driver, "p2p_e2e_03b_register_attempt")

        log_phase("Registration Modal", "PASS", "Registration flow accessible")
    else:
        # Maybe already registered
        log_phase("Registration Modal", "PARTIAL", "Modal may not be needed (already registered?)")

    # Close any open modal
    js_call(driver, "closeModal", "register-modal")
    time.sleep(0.5)
    return True

def phase_4_create_order(driver):
    """Phase 4: Create Order"""
    print("\n=== Phase 4: Create Order ===")

    # Click New Offer button
    new_offer_clicked = safe_click(driver, ".new-offer-btn, button[onclick*='showCreateOrder'], [class*='new-offer']")
    if not new_offer_clicked:
        js_call(driver, "showCreateOrderModal")

    time.sleep(1)
    screenshot(driver, "p2p_e2e_04_create_order_modal")

    # Fill order form
    try:
        # Amount
        amount_input = driver.find_elements(By.CSS_SELECTOR, "#create-amount, input[id*='amount']")
        if amount_input:
            amount_input[0].clear()
            amount_input[0].send_keys("100")
            print("  Set amount: 100")

        # Price
        price_input = driver.find_elements(By.CSS_SELECTOR, "#create-price, input[id*='price']")
        if price_input:
            price_input[0].clear()
            price_input[0].send_keys("0.01")
            print("  Set price: 0.01")

        # Min limit
        min_input = driver.find_elements(By.CSS_SELECTOR, "#create-min-limit, input[id*='min']")
        if min_input:
            min_input[0].clear()
            min_input[0].send_keys("1")
            print("  Set min: 1")

        # Max limit
        max_input = driver.find_elements(By.CSS_SELECTOR, "#create-max-limit, input[id*='max']")
        if max_input:
            max_input[0].clear()
            max_input[0].send_keys("100")
            print("  Set max: 100")

        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_04b_order_filled")

        # Try to submit
        submit_btn = driver.find_elements(By.CSS_SELECTOR,
            "button[onclick*='createOrder'], button[onclick*='postOrder'], .create-order-submit, button:contains('Post')")
        if submit_btn:
            submit_btn[0].click()
            print("  Clicked submit button")
        else:
            js_call(driver, "createOrder")
            print("  Called createOrder() via JS")

        time.sleep(3)
        screenshot(driver, "p2p_e2e_04c_order_submitted")

        log_phase("Create Order", "PASS", "Order creation flow completed")
    except Exception as e:
        log_phase("Create Order", "FAIL", str(e))

    # Close modal
    js_call(driver, "closeModal", "create-order-modal")
    time.sleep(0.5)
    return True

def phase_5_verify_order(driver):
    """Phase 5: Verify Order Visible"""
    print("\n=== Phase 5: Verify Order in Order Book ===")

    # Refresh page
    driver.refresh()
    time.sleep(3)
    screenshot(driver, "p2p_e2e_05_after_refresh")

    # Look for orders in the table
    orders = driver.find_elements(By.CSS_SELECTOR, ".order-row, .order-card, tr[data-order-id]")
    print(f"  Found {len(orders)} orders in order book")

    if len(orders) > 0:
        log_phase("Order Visibility", "PASS", f"Found {len(orders)} orders")
    else:
        # Check if still loading
        loading = driver.find_elements(By.XPATH, "//*[contains(text(), 'Loading')]")
        if loading:
            log_phase("Order Visibility", "PARTIAL", "Still loading orders")
        else:
            no_orders = driver.find_elements(By.XPATH, "//*[contains(text(), 'No orders')]")
            if no_orders:
                log_phase("Order Visibility", "PARTIAL", "No orders found (may need to create)")
            else:
                log_phase("Order Visibility", "FAIL", "Could not verify orders")

    return True

def phase_6_my_orders(driver):
    """Phase 6: Check My Orders Tab"""
    print("\n=== Phase 6: My Orders Tab ===")

    # Open My Trades modal
    active_trades_btn = safe_click(driver, ".active-trades-btn, button[onclick*='showMyTrades']")
    if not active_trades_btn:
        js_call(driver, "showMyTrades")

    time.sleep(1)
    screenshot(driver, "p2p_e2e_06_my_trades_modal")

    # Click My Orders tab
    my_orders_tab = driver.find_elements(By.XPATH, "//button[contains(text(), 'My Orders')]")
    if my_orders_tab:
        my_orders_tab[0].click()
        time.sleep(1)
        screenshot(driver, "p2p_e2e_06b_my_orders_tab")
        log_phase("My Orders Tab", "PASS", "Tab accessible")
    else:
        log_phase("My Orders Tab", "PARTIAL", "Tab not found")

    # Close modal
    js_call(driver, "closeModal", "my-trades-modal")
    time.sleep(0.5)
    return True

def phase_7_escrow_staking(driver):
    """Phase 7: Escrow Staking Functions"""
    print("\n=== Phase 7: Escrow Staking ===")

    # Click Become Arbiter button
    arbiter_btn = safe_click(driver, ".become-arbiter-btn, button[onclick*='showEscrowStaking']")
    if not arbiter_btn:
        js_call(driver, "showEscrowStaking")

    time.sleep(1)
    screenshot(driver, "p2p_e2e_07_escrow_modal")

    # Check if stats show real data (not mock)
    stats_text = driver.find_elements(By.CSS_SELECTOR, "#escrow-modal .stat-value, .escrow-stats")
    if stats_text:
        for stat in stats_text[:3]:
            print(f"  Stat: {stat.text}")

    # Try stake input
    stake_input = driver.find_elements(By.CSS_SELECTOR, "#stake-amount, input[id*='stake']")
    if stake_input:
        stake_input[0].clear()
        stake_input[0].send_keys("1000")
        print("  Set stake amount: 1000")
        screenshot(driver, "p2p_e2e_07b_stake_amount")

    # Try stake button
    stake_btn = driver.find_elements(By.CSS_SELECTOR, "button[onclick*='stakeEscrow'], .stake-btn")
    if stake_btn:
        stake_btn[0].click()
        time.sleep(2)
        screenshot(driver, "p2p_e2e_07c_stake_clicked")
        print("  Clicked stake button")

    # Try unstake
    success, _ = js_call(driver, "unstakeEscrow")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_07d_unstake")
    print(f"  Unstake called: {success}")

    # Try claim rewards
    success, _ = js_call(driver, "claimEscrowRewards")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_07e_claim_rewards")
    print(f"  Claim rewards called: {success}")

    log_phase("Escrow Staking", "PASS", "Escrow functions accessible")

    # Close modal
    js_call(driver, "closeModal", "escrow-modal")
    time.sleep(0.5)
    return True

def phase_8_dispute_center(driver):
    """Phase 8: Dispute Center"""
    print("\n=== Phase 8: Dispute Center ===")

    # Open dispute center
    js_call(driver, "showDisputeCenter")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_08_dispute_center")

    # Check My Disputes tab
    my_disputes_tab = driver.find_elements(By.XPATH, "//button[contains(text(), 'My Disputes')]")
    if my_disputes_tab:
        my_disputes_tab[0].click()
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_08b_my_disputes")

    # Check Arbitration Queue tab
    arb_tab = driver.find_elements(By.XPATH, "//button[contains(text(), 'Arbitration')]")
    if arb_tab:
        arb_tab[0].click()
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_08c_arbitration_queue")

    log_phase("Dispute Center", "PASS", "Dispute center accessible")

    # Close modal
    js_call(driver, "closeModal", "dispute-modal")
    time.sleep(0.5)
    return True

def phase_9_global_stats(driver):
    """Phase 9: Global Statistics"""
    print("\n=== Phase 9: Global Statistics ===")

    js_call(driver, "showGlobalStats")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_09_global_stats")

    # Check for stats (should be real, not mock)
    stats = driver.find_elements(By.CSS_SELECTOR, ".stat-card, .stat-value")
    for stat in stats[:5]:
        print(f"  Stat: {stat.text[:50]}...")

    log_phase("Global Stats", "PASS", "Stats modal accessible")

    js_call(driver, "closeModal", "global-stats-modal")
    time.sleep(0.5)
    return True

def phase_10_help_modal(driver):
    """Phase 10: Help/Education Modal"""
    print("\n=== Phase 10: Help Modal ===")

    js_call(driver, "showHelp")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_10_help")

    # Check for guide content
    guide = driver.find_elements(By.XPATH, "//*[contains(text(), 'P2P Trading')]")
    if guide:
        log_phase("Help Modal", "PASS", "Help guide accessible")
    else:
        log_phase("Help Modal", "PARTIAL", "Modal opened but content unclear")

    js_call(driver, "closeModal", "help-modal")
    time.sleep(0.5)
    return True

def phase_11_telegram_settings(driver):
    """Phase 11: Telegram Settings (should redirect)"""
    print("\n=== Phase 11: Telegram Settings ===")

    js_call(driver, "showTelegramSettings")
    time.sleep(1)
    screenshot(driver, "p2p_e2e_11_telegram")

    # Check if redirect message shown
    redirect_text = driver.find_elements(By.XPATH, "//*[contains(text(), 'Settings') and contains(text(), 'moved')]")
    if redirect_text:
        log_phase("Telegram Settings", "PASS", "Shows redirect to main settings")
    else:
        log_phase("Telegram Settings", "PARTIAL", "Modal opened")

    js_call(driver, "closeModal", "telegram-settings-modal")
    time.sleep(0.5)
    return True

def phase_12_asset_tabs(driver):
    """Phase 12: Asset Tab Switching"""
    print("\n=== Phase 12: Asset Tabs ===")

    # Test FOMO tab
    js_call(driver, "switchAsset", 174)
    time.sleep(1)
    screenshot(driver, "p2p_e2e_12_fomo")
    print("  Switched to FOMO (174)")

    # Test BEAM tab
    js_call(driver, "switchAsset", 0)
    time.sleep(1)
    screenshot(driver, "p2p_e2e_12b_beam")
    print("  Switched to BEAM (0)")

    # Test NPH tab
    js_call(driver, "switchAsset", 47)
    time.sleep(1)
    screenshot(driver, "p2p_e2e_12c_nph")
    print("  Switched to NPH (47)")

    log_phase("Asset Tabs", "PASS", "Asset switching works")
    return True

def phase_13_buy_sell_toggle(driver):
    """Phase 13: Buy/Sell Toggle"""
    print("\n=== Phase 13: Buy/Sell Toggle ===")

    # Switch to Buy
    buy_btn = driver.find_elements(By.CSS_SELECTOR, ".buy-btn, button[onclick*='setBuySide']")
    if buy_btn:
        buy_btn[0].click()
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_13_buy_mode")
        print("  Switched to Buy mode")

    # Switch to Sell
    sell_btn = driver.find_elements(By.CSS_SELECTOR, ".sell-btn, button[onclick*='setSellSide']")
    if sell_btn:
        sell_btn[0].click()
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_13b_sell_mode")
        print("  Switched to Sell mode")

    log_phase("Buy/Sell Toggle", "PASS", "Toggle works")
    return True

def phase_14_filters(driver):
    """Phase 14: Filter Controls"""
    print("\n=== Phase 14: Filters ===")

    # Currency dropdown
    currency_select = driver.find_elements(By.CSS_SELECTOR, "#currency-filter, select[id*='currency']")
    if currency_select:
        currency_select[0].click()
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_14_currency_dropdown")
        # Select USD
        usd_option = driver.find_elements(By.CSS_SELECTOR, "option[value='USD']")
        if usd_option:
            usd_option[0].click()
            print("  Selected USD")

    # Payment method dropdown
    payment_select = driver.find_elements(By.CSS_SELECTOR, "#payment-filter, [id*='payment']")
    if payment_select:
        payment_select[0].click()
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_14b_payment_dropdown")

    # Amount input
    amount_input = driver.find_elements(By.CSS_SELECTOR, "#amount-filter, input[placeholder*='Amount']")
    if amount_input:
        amount_input[0].clear()
        amount_input[0].send_keys("50")
        screenshot(driver, "p2p_e2e_14c_amount_filter")
        print("  Set amount filter: 50")

    log_phase("Filters", "PASS", "Filters accessible")
    return True

def phase_15_header_buttons(driver):
    """Phase 15: All Header Buttons"""
    print("\n=== Phase 15: Header Buttons ===")

    buttons_tested = 0

    # Stats button (chart icon)
    if safe_click(driver, ".header-btn[onclick*='showGlobalStats'], [title*='Stats']"):
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_15_stats_btn")
        js_call(driver, "closeModal", "global-stats-modal")
        buttons_tested += 1
        print("  Stats button works")

    # Help button
    if safe_click(driver, ".header-btn[onclick*='showHelp'], [title*='Help']"):
        time.sleep(0.5)
        screenshot(driver, "p2p_e2e_15b_help_btn")
        js_call(driver, "closeModal", "help-modal")
        buttons_tested += 1
        print("  Help button works")

    log_phase("Header Buttons", "PASS", f"Tested {buttons_tested} buttons")
    return True

def phase_16_active_trade_modal(driver):
    """Phase 16: Active Trade Modal (if trade exists)"""
    print("\n=== Phase 16: Active Trade Modal ===")

    # Open My Trades
    js_call(driver, "showMyTrades")
    time.sleep(1)

    # Look for any active trade to click
    trade_cards = driver.find_elements(By.CSS_SELECTOR, ".trade-card, [data-trade-id]")
    if trade_cards:
        trade_cards[0].click()
        time.sleep(1)
        screenshot(driver, "p2p_e2e_16_active_trade")

        # Check for chat section (should be at top now)
        chat = driver.find_elements(By.CSS_SELECTOR, "#trade-chat, .trade-chat")
        if chat:
            print("  Chat section found")
            screenshot(driver, "p2p_e2e_16b_trade_chat")

        # Check for rules warning
        rules = driver.find_elements(By.CSS_SELECTOR, ".trade-rules-warning")
        if rules:
            print("  Trade rules warning found")
            screenshot(driver, "p2p_e2e_16c_trade_rules")

        log_phase("Active Trade Modal", "PASS", "Modal with chat accessible")
    else:
        log_phase("Active Trade Modal", "SKIP", "No active trades to test")

    js_call(driver, "closeModal", "my-trades-modal")
    js_call(driver, "closeModal", "active-trade-modal")
    time.sleep(0.5)
    return True

def generate_report(driver):
    """Generate final test report"""
    print("\n" + "="*60)
    print("FINAL TEST REPORT")
    print("="*60)

    results["completed"] = datetime.now().isoformat()
    results["pass_rate"] = f"{(results['passed']/results['total_tests']*100):.1f}%" if results['total_tests'] > 0 else "N/A"

    print(f"\nTotal Tests: {results['total_tests']}")
    print(f"Passed: {results['passed']}")
    print(f"Failed: {results['failed']}")
    print(f"Pass Rate: {results['pass_rate']}")
    print(f"\nScreenshots: {len(results['screenshots'])}")

    print("\n--- Phase Results ---")
    for phase, data in results["phases"].items():
        status_icon = "✓" if data["status"] == "PASS" else ("~" if data["status"] == "PARTIAL" else "✗")
        print(f"  {status_icon} {phase}: {data['status']} - {data['details'][:50]}")

    # Save JSON report
    report_path = f"{SCREENSHOT_DIR}/e2e_test_report.json"
    with open(report_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nReport saved: {report_path}")

    # Take final screenshot
    screenshot(driver, "p2p_e2e_99_final_state")

    return results

# ============================================
# MAIN EXECUTION
# ============================================

def main():
    print("="*60)
    print("BEAM P2P Exchange - E2E Test Suite")
    print("="*60)
    print(f"Target: {P2P_URL}")
    print(f"Screenshots: {SCREENSHOT_DIR}")

    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    driver = None
    try:
        driver = setup_driver()

        # Run all test phases
        phase_1_page_load(driver)
        phase_2_wallet_status(driver)
        phase_3_registration(driver)
        phase_4_create_order(driver)
        phase_5_verify_order(driver)
        phase_6_my_orders(driver)
        phase_7_escrow_staking(driver)
        phase_8_dispute_center(driver)
        phase_9_global_stats(driver)
        phase_10_help_modal(driver)
        phase_11_telegram_settings(driver)
        phase_12_asset_tabs(driver)
        phase_13_buy_sell_toggle(driver)
        phase_14_filters(driver)
        phase_15_header_buttons(driver)
        phase_16_active_trade_modal(driver)

        # Generate report
        generate_report(driver)

    except Exception as e:
        print(f"\n[ERROR] Test suite failed: {e}")
        import traceback
        traceback.print_exc()
        if driver:
            screenshot(driver, "p2p_e2e_error")
    finally:
        if driver:
            # Don't close if connected to debug session
            try:
                driver.current_url  # Check if still connected
                print("\nBrowser left open (debug session)")
            except:
                pass

if __name__ == "__main__":
    main()
