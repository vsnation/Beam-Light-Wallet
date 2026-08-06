#!/usr/bin/env python3
"""
P2P Buyer Flow Test - Accept order and complete trade
Continues from where we left off with Order #1 created by seller (test_wallet)
"""

import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

# Test configuration
BUYER_WALLET = "test_2"
BUYER_PASSWORD = "test_2"
BASE_URL = "http://127.0.0.1:8080"

def connect_to_chrome():
    """Connect to existing Chrome debug session"""
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    driver = webdriver.Chrome(options=options)
    return driver

def screenshot(driver, name):
    """Take a screenshot"""
    path = f"{REPO_ROOT}/tests/screenshots/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def wait_and_click(driver, selector, timeout=10, by=By.CSS_SELECTOR):
    """Wait for element and click it"""
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, selector))
    )
    element.click()
    return element

def wait_for_element(driver, selector, timeout=10, by=By.CSS_SELECTOR):
    """Wait for element to be present"""
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, selector))
    )

def switch_to_buyer_wallet(driver):
    """Lock current wallet and unlock buyer wallet"""
    print("\n=== Switching to Buyer Wallet (test_2) ===")

    # Go to main wallet page first
    driver.get(f"{BASE_URL}/wallet.html")
    time.sleep(2)
    screenshot(driver, "buyer_01_initial")

    # Check if we need to lock first (look for lock button)
    try:
        lock_btn = driver.find_element(By.CSS_SELECTOR, "#lockBtn, .lock-btn, [onclick*='lock']")
        print("Found lock button, clicking to lock wallet...")
        lock_btn.click()
        time.sleep(2)
        screenshot(driver, "buyer_02_locked")
    except:
        print("No lock button found or already locked")

    # Now we should be at unlock screen
    time.sleep(1)
    screenshot(driver, "buyer_03_unlock_screen")

    # Check current page state
    page_source = driver.page_source

    # Look for wallet selector or unlock form
    if "wallet-select" in page_source or "walletSelect" in page_source:
        print("Found wallet selector")
        try:
            # Try to find and click wallet dropdown
            wallet_select = driver.find_element(By.CSS_SELECTOR, "#walletSelect, #wallet-select, select[name='wallet']")
            wallet_select.click()
            time.sleep(0.5)

            # Select test_2
            options = wallet_select.find_elements(By.TAG_NAME, "option")
            for opt in options:
                if "test_2" in opt.text or opt.get_attribute("value") == "test_2":
                    opt.click()
                    print(f"Selected wallet: {opt.text}")
                    break
            time.sleep(0.5)
        except Exception as e:
            print(f"Error selecting wallet: {e}")

    # Enter password
    try:
        password_input = driver.find_element(By.CSS_SELECTOR, "#password, #unlockPassword, input[type='password']")
        password_input.clear()
        password_input.send_keys(BUYER_PASSWORD)
        print(f"Entered password for {BUYER_WALLET}")
        time.sleep(0.5)
        screenshot(driver, "buyer_04_password_entered")
    except Exception as e:
        print(f"Error entering password: {e}")

    # Click unlock button
    try:
        unlock_btn = driver.find_element(By.CSS_SELECTOR, "#unlockBtn, button[type='submit'], .btn-primary")
        unlock_btn.click()
        print("Clicked unlock button")
        time.sleep(3)
        screenshot(driver, "buyer_05_after_unlock")
    except Exception as e:
        print(f"Error clicking unlock: {e}")

    # Wait for wallet to load
    time.sleep(2)

    # Check if we're now in the wallet
    page_source = driver.page_source
    if "Dashboard" in page_source or "balance" in page_source.lower() or "BEAM" in page_source:
        print("Wallet unlocked successfully!")
        return True
    else:
        print("Wallet may not have unlocked properly")
        screenshot(driver, "buyer_06_unlock_status")
        return False

def setup_buyer_payment_methods(driver):
    """Setup payment methods in localStorage for buyer"""
    print("\n=== Setting up Buyer Payment Methods ===")

    # Setup payment methods with accountInfo
    payment_methods_data = {
        "bank_transfer": {
            "id": "bank_transfer",
            "name": "Bank Transfer",
            "enabled": True,
            "accountInfo": "Buyer Bank: 9999-8888-7777"
        },
        "wise": {
            "id": "wise",
            "name": "Wise",
            "enabled": True,
            "accountInfo": "buyer@example.com"
        }
    }

    driver.execute_script(f"""
        localStorage.setItem('p2p_payment_methods', JSON.stringify({json.dumps(payment_methods_data)}));
        console.log('Buyer payment methods set:', localStorage.getItem('p2p_payment_methods'));
    """)
    print("Payment methods configured for buyer")

def navigate_to_p2p(driver):
    """Navigate to P2P page"""
    print("\n=== Navigating to P2P ===")

    # Try direct URL
    driver.get(f"{BASE_URL}/wallet.html#p2p")
    time.sleep(2)
    screenshot(driver, "buyer_10_p2p_nav")

    # Click P2P nav if available
    try:
        p2p_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='p2p'], [data-page='p2p'], .nav-item")
        for link in p2p_links:
            if 'p2p' in link.get_attribute('href') or 'P2P' in link.text:
                link.click()
                print("Clicked P2P nav link")
                time.sleep(2)
                break
    except:
        pass

    screenshot(driver, "buyer_11_p2p_page")

    # Wait for iframe to load
    time.sleep(2)

    # Switch to P2P iframe
    try:
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        print(f"Found {len(iframes)} iframes")
        for iframe in iframes:
            src = iframe.get_attribute("src") or ""
            if "p2p" in src.lower():
                driver.switch_to.frame(iframe)
                print("Switched to P2P iframe")
                time.sleep(1)
                break
    except Exception as e:
        print(f"Error switching to iframe: {e}")

    screenshot(driver, "buyer_12_in_iframe")

def find_and_accept_order(driver):
    """Find Order #1 and accept it as buyer"""
    print("\n=== Finding and Accepting Order #1 ===")

    # Look for the order in the list
    time.sleep(2)
    screenshot(driver, "buyer_20_order_list")

    # Check page content
    page_source = driver.page_source
    print(f"Page contains 'order': {'order' in page_source.lower()}")
    print(f"Page contains 'accept': {'accept' in page_source.lower()}")
    print(f"Page contains 'buy': {'buy' in page_source.lower()}")

    # Try to find Buy/Accept button for order
    try:
        # Look for Buy button (buyer sees "Buy" for sell orders)
        buy_buttons = driver.find_elements(By.CSS_SELECTOR,
            "button.buy-btn, .order-card button, button[onclick*='accept'], button[onclick*='buy']")

        if not buy_buttons:
            # Try finding by text
            all_buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in all_buttons:
                text = btn.text.lower()
                if 'buy' in text or 'accept' in text:
                    buy_buttons.append(btn)

        print(f"Found {len(buy_buttons)} potential buy/accept buttons")

        if buy_buttons:
            # Click the first one
            buy_buttons[0].click()
            print("Clicked Buy/Accept button")
            time.sleep(2)
            screenshot(driver, "buyer_21_accept_clicked")
            return True
    except Exception as e:
        print(f"Error finding accept button: {e}")

    # Alternative: Look for order card and click it
    try:
        order_cards = driver.find_elements(By.CSS_SELECTOR, ".order-card, .order-item, [data-order-id]")
        print(f"Found {len(order_cards)} order cards")

        for card in order_cards:
            card_text = card.text.lower()
            if 'fomo' in card_text or 'sell' in card_text:
                # This is our order
                print(f"Found order card: {card.text[:100]}")

                # Try to find button inside
                btns = card.find_elements(By.TAG_NAME, "button")
                for btn in btns:
                    if 'buy' in btn.text.lower() or 'accept' in btn.text.lower():
                        btn.click()
                        print("Clicked button in order card")
                        time.sleep(2)
                        screenshot(driver, "buyer_22_order_action")
                        return True
    except Exception as e:
        print(f"Error with order cards: {e}")

    return False

def handle_accept_modal(driver):
    """Handle the accept order modal/confirmation"""
    print("\n=== Handling Accept Order Modal ===")

    time.sleep(2)
    screenshot(driver, "buyer_30_modal")

    # Look for amount input (buyer specifies how much they want to buy)
    try:
        amount_input = driver.find_element(By.CSS_SELECTOR,
            "input[name='amount'], #acceptAmount, .amount-input, input[type='number']")
        amount_input.clear()
        amount_input.send_keys("0.03")  # Buy 0.03 FOMO (small amount)
        print("Entered buy amount: 0.03")
        time.sleep(0.5)
    except Exception as e:
        print(f"No amount input or error: {e}")

    # Select payment method
    try:
        payment_selects = driver.find_elements(By.CSS_SELECTOR,
            "select[name='payment'], #paymentMethod, .payment-select")
        for select in payment_selects:
            options = select.find_elements(By.TAG_NAME, "option")
            if len(options) > 1:
                options[1].click()  # Select first payment method
                print("Selected payment method")
                break
    except Exception as e:
        print(f"No payment select or error: {e}")

    screenshot(driver, "buyer_31_modal_filled")

    # Click confirm/accept button
    try:
        confirm_btns = driver.find_elements(By.CSS_SELECTOR,
            "button[type='submit'], .btn-primary, button.confirm, button.accept")

        for btn in confirm_btns:
            text = btn.text.lower()
            if 'confirm' in text or 'accept' in text or 'buy' in text or 'proceed' in text:
                btn.click()
                print(f"Clicked confirm button: {btn.text}")
                time.sleep(2)
                screenshot(driver, "buyer_32_confirmed")
                return True
    except Exception as e:
        print(f"Error confirming: {e}")

    return False

def handle_tx_confirmation(driver):
    """Handle blockchain transaction confirmation modal"""
    print("\n=== Handling TX Confirmation ===")

    time.sleep(2)
    screenshot(driver, "buyer_40_tx_modal")

    # Look for TX confirmation modal
    try:
        # Check for modal with 'show' class (P2P style)
        modals = driver.find_elements(By.CSS_SELECTOR, ".modal.show, .tx-modal, #txConfirmModal")
        print(f"Found {len(modals)} modals")

        for modal in modals:
            if modal.is_displayed():
                # Find confirm button
                btns = modal.find_elements(By.TAG_NAME, "button")
                for btn in btns:
                    text = btn.text.lower()
                    if 'confirm' in text or 'sign' in text or 'approve' in text:
                        btn.click()
                        print(f"Clicked TX confirm: {btn.text}")
                        time.sleep(3)
                        screenshot(driver, "buyer_41_tx_confirmed")
                        return True
    except Exception as e:
        print(f"Error with TX modal: {e}")

    # Alternative: look for any confirm button
    try:
        all_buttons = driver.find_elements(By.TAG_NAME, "button")
        for btn in all_buttons:
            if btn.is_displayed():
                text = btn.text.lower()
                if 'confirm' in text and 'transaction' not in text:
                    btn.click()
                    print(f"Clicked: {btn.text}")
                    time.sleep(3)
                    return True
    except:
        pass

    return False

def verify_order_accepted(driver):
    """Verify the order was accepted and trade is in progress"""
    print("\n=== Verifying Order Accepted ===")

    time.sleep(3)
    screenshot(driver, "buyer_50_after_accept")

    # Check for trade/order status change
    page_source = driver.page_source.lower()

    success_indicators = ['pending', 'in progress', 'waiting', 'payment', 'escrow', 'active trade']
    for indicator in success_indicators:
        if indicator in page_source:
            print(f"Found success indicator: '{indicator}'")
            return True

    # Check for any success message
    try:
        success_msgs = driver.find_elements(By.CSS_SELECTOR, ".success, .alert-success, .toast")
        for msg in success_msgs:
            if msg.is_displayed():
                print(f"Success message: {msg.text}")
                return True
    except:
        pass

    return False

def main():
    """Main test flow"""
    print("=" * 60)
    print("P2P Buyer Flow Test - Accept Order and Complete Trade")
    print("=" * 60)

    driver = connect_to_chrome()
    print(f"Connected to Chrome, current URL: {driver.current_url}")

    try:
        # Step 1: Switch to buyer wallet
        if not switch_to_buyer_wallet(driver):
            print("Failed to unlock buyer wallet, trying alternative approach...")
            # Try API unlock
            driver.execute_script(f"""
                fetch('/api/wallet/unlock', {{
                    method: 'POST',
                    headers: {{'Content-Type': 'application/json'}},
                    body: JSON.stringify({{wallet: '{BUYER_WALLET}', password: '{BUYER_PASSWORD}'}})
                }}).then(r => r.json()).then(d => console.log('Unlock result:', d));
            """)
            time.sleep(5)
            driver.refresh()
            time.sleep(3)

        # Step 2: Setup payment methods for buyer
        setup_buyer_payment_methods(driver)

        # Step 3: Navigate to P2P
        navigate_to_p2p(driver)

        # Step 4: Find and accept the order
        if find_and_accept_order(driver):
            print("Found order, attempting to accept...")

            # Step 5: Handle accept modal
            if handle_accept_modal(driver):
                print("Accept modal handled")

                # Step 6: Handle TX confirmation
                if handle_tx_confirmation(driver):
                    print("TX confirmed")

                    # Step 7: Verify acceptance
                    if verify_order_accepted(driver):
                        print("\n*** ORDER ACCEPTED SUCCESSFULLY! ***")
                    else:
                        print("Could not verify order acceptance")
                else:
                    print("TX confirmation may have failed")
            else:
                print("Accept modal handling failed")
        else:
            print("Could not find order to accept")

            # Debug: print page content
            print("\n--- Page Debug Info ---")
            print(f"Current URL: {driver.current_url}")
            print(f"Page title: {driver.title}")

            # Check if we're in main frame
            try:
                driver.switch_to.default_content()
                print("Switched to default content")
                screenshot(driver, "buyer_debug_main")
            except:
                pass

    except Exception as e:
        print(f"\nError in test flow: {e}")
        import traceback
        traceback.print_exc()
        screenshot(driver, "buyer_error")

    finally:
        print("\n" + "=" * 60)
        print("Test completed. Check screenshots for details.")
        print("=" * 60)
        # Don't close driver - keep session for inspection

if __name__ == "__main__":
    main()
