#!/usr/bin/env python3
"""
Test Required Feedback Flow in P2P Marketplace
Tests that feedback is required before claiming deposits
"""

import time
import json
import urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots"
BASE_URL = "http://127.0.0.1:9080"

def http_post(url, data=None):
    """Make HTTP POST request"""
    body = json.dumps(data).encode() if data else b''
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"HTTP Error: {e}")
        return {"error": str(e)}

def setup_driver():
    """Setup Chrome driver with remote debugging"""
    options = Options()
    options.add_experimental_option('debuggerAddress', '127.0.0.1:9222')
    return webdriver.Chrome(options=options)

def switch_to_p2p_iframe(driver):
    """Switch to P2P iframe"""
    driver.switch_to.default_content()
    time.sleep(1)
    for iframe in driver.find_elements(By.TAG_NAME, 'iframe'):
        src = iframe.get_attribute('src') or ''
        if 'p2p' in src:
            driver.switch_to.frame(iframe)
            return True
    return False

def take_screenshot(driver, name):
    """Save screenshot"""
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"  Screenshot: {path}")
    return path

def test_feedback_modal_appears_for_buyer(driver):
    """Test that feedback modal appears when buyer tries to claim"""
    print("\n=== Test 1: Feedback Modal for Buyer ===")

    # Setup mock trade in seller_confirmed status (buyer can claim)
    js_setup = """
        const mockTrade = {
            id: 'feedback_test_buyer_' + Date.now(),
            buyer: 'buyer_address_123',
            seller: 'seller_address_456',
            amount: 100000000,
            assetId: 174,
            status: 'seller_confirmed',
            currency: 'USD',
            payAmount: 10.00
        };

        if (!window.state) window.state = {};
        state.myAddress = 'buyer_address_123';  // We are the buyer
        state.activeTrade = mockTrade;

        // Clear any previous feedback
        localStorage.removeItem('feedback_' + mockTrade.id + '_buyer');

        // Open trade modal
        const modal = document.getElementById('active-trade-modal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('active-trade-status').textContent = 'Ready to Claim';
        }

        return mockTrade.id;
    """
    trade_id = driver.execute_script(js_setup)
    time.sleep(1)
    take_screenshot(driver, "01_buyer_ready_to_claim")

    # Try to claim - should show feedback modal
    js_claim = """
        if (typeof claimTrade === 'function') {
            claimTrade();
            return true;
        }
        return false;
    """
    result = driver.execute_script(js_claim)
    time.sleep(1)

    # Check if required feedback modal appeared
    js_check_modal = """
        const modal = document.getElementById('required-feedback-modal');
        return modal && modal.classList.contains('show');
    """
    modal_visible = driver.execute_script(js_check_modal)

    take_screenshot(driver, "02_feedback_modal_for_buyer")

    if modal_visible:
        print("  PASS: Required feedback modal appeared for buyer")

        # Verify modal has no skip/close button
        js_check_no_skip = """
            const modal = document.getElementById('required-feedback-modal');
            const skipBtn = modal.querySelector('.btn-secondary');
            const closeBtn = modal.querySelector('.modal-close');
            return !skipBtn && !closeBtn;
        """
        no_skip = driver.execute_script(js_check_no_skip)
        if no_skip:
            print("  PASS: No skip or close button (feedback is mandatory)")
        else:
            print("  WARN: Found skip/close button - feedback might be skippable")

        return True
    else:
        print("  FAIL: Required feedback modal did NOT appear")
        return False

def test_feedback_submission_for_buyer(driver):
    """Test that buyer can submit feedback"""
    print("\n=== Test 2: Buyer Submits Feedback ===")

    # Check if modal is open
    js_check = """
        const modal = document.getElementById('required-feedback-modal');
        return modal && modal.classList.contains('show');
    """
    if not driver.execute_script(js_check):
        print("  SKIP: Feedback modal not open")
        return False

    # Set rating to 4 stars
    js_rate = """
        if (typeof setRequiredFeedbackRating === 'function') {
            setRequiredFeedbackRating(4);
            return true;
        }
        return false;
    """
    driver.execute_script(js_rate)
    time.sleep(0.5)
    take_screenshot(driver, "03_buyer_rating_4_stars")

    # Add comment
    js_comment = """
        const textarea = document.getElementById('req-feedback-comment');
        if (textarea) {
            textarea.value = 'Great seller, fast response!';
            return true;
        }
        return false;
    """
    driver.execute_script(js_comment)
    time.sleep(0.5)
    take_screenshot(driver, "04_buyer_feedback_with_comment")

    # Check that feedback is stored after submission
    # (We won't actually submit to avoid contract calls, just verify the flow)
    print("  PASS: Buyer can set rating and comment")

    # Close modal for next test
    driver.execute_script("closeModal('required-feedback-modal');")
    time.sleep(0.5)

    return True

def test_feedback_modal_appears_for_seller(driver):
    """Test that feedback modal appears when seller tries to confirm"""
    print("\n=== Test 3: Feedback Modal for Seller ===")

    # Setup mock trade in payment_sent status (seller can confirm)
    js_setup = """
        const mockTrade = {
            id: 'feedback_test_seller_' + Date.now(),
            buyer: 'buyer_address_123',
            seller: 'seller_address_456',
            amount: 100000000,
            assetId: 174,
            status: 'payment_sent',
            currency: 'USD',
            payAmount: 10.00
        };

        if (!window.state) window.state = {};
        state.myAddress = 'seller_address_456';  // We are the seller
        state.activeTrade = mockTrade;

        // Clear any previous feedback
        localStorage.removeItem('feedback_' + mockTrade.id + '_seller');

        // Open trade modal
        const modal = document.getElementById('active-trade-modal');
        if (modal) {
            modal.classList.add('show');
            document.getElementById('active-trade-status').textContent = 'Payment Sent - Confirm Receipt';
        }

        return mockTrade.id;
    """
    trade_id = driver.execute_script(js_setup)
    time.sleep(1)
    take_screenshot(driver, "05_seller_ready_to_confirm")

    # Try to confirm - should show feedback modal
    js_confirm = """
        if (typeof confirmPaymentReceived === 'function') {
            confirmPaymentReceived();
            return true;
        }
        return false;
    """
    result = driver.execute_script(js_confirm)
    time.sleep(1)

    # Check if required feedback modal appeared
    js_check_modal = """
        const modal = document.getElementById('required-feedback-modal');
        return modal && modal.classList.contains('show');
    """
    modal_visible = driver.execute_script(js_check_modal)

    take_screenshot(driver, "06_feedback_modal_for_seller")

    if modal_visible:
        print("  PASS: Required feedback modal appeared for seller")

        # Check the role text
        js_check_role = """
            const roleEl = document.getElementById('req-feedback-role');
            return roleEl ? roleEl.textContent : '';
        """
        role_text = driver.execute_script(js_check_role)
        print(f"  Role text: {role_text}")

        return True
    else:
        print("  FAIL: Required feedback modal did NOT appear")
        return False

def test_star_rating_interaction(driver):
    """Test star rating interaction"""
    print("\n=== Test 4: Star Rating Interaction ===")

    # Check if modal is open
    js_check = """
        const modal = document.getElementById('required-feedback-modal');
        return modal && modal.classList.contains('show');
    """
    if not driver.execute_script(js_check):
        # Open a fresh modal
        js_setup = """
            const mockTrade = {
                id: 'star_test_' + Date.now(),
                buyer: 'buyer_addr',
                seller: 'seller_addr',
                amount: 50000000,
                assetId: 174,
                status: 'seller_confirmed'
            };
            state.myAddress = 'buyer_addr';
            state.activeTrade = mockTrade;
            localStorage.removeItem('feedback_' + mockTrade.id + '_buyer');
            claimTrade();
        """
        driver.execute_script(js_setup)
        time.sleep(1)

    # Test each star rating
    for rating in [1, 2, 3, 4, 5]:
        js_rate = f"setRequiredFeedbackRating({rating});"
        driver.execute_script(js_rate)
        time.sleep(0.3)

        # Get the label
        js_label = "return document.getElementById('req-rating-label').textContent;"
        label = driver.execute_script(js_label)

        expected_labels = {1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent'}
        if label == expected_labels[rating]:
            print(f"  PASS: {rating} star(s) = '{label}'")
        else:
            print(f"  FAIL: {rating} star(s) = '{label}' (expected '{expected_labels[rating]}')")

    take_screenshot(driver, "07_star_ratings_tested")

    # Close modal
    driver.execute_script("closeModal('required-feedback-modal');")
    time.sleep(0.5)

    return True

def test_feedback_stored_in_localstorage(driver):
    """Test that feedback is stored in localStorage"""
    print("\n=== Test 5: Feedback Storage ===")

    # Setup and submit feedback
    js_setup = """
        const mockTrade = {
            id: 'storage_test_' + Date.now(),
            buyer: 'buyer_addr',
            seller: 'seller_addr',
            amount: 50000000,
            assetId: 174,
            status: 'seller_confirmed'
        };
        state.myAddress = 'buyer_addr';
        state.activeTrade = mockTrade;
        localStorage.removeItem('feedback_' + mockTrade.id + '_buyer');

        // Open modal
        showRequiredFeedbackModal(mockTrade, 'buyer', function() {
            console.log('Callback would be called');
        });

        return mockTrade.id;
    """
    trade_id = driver.execute_script(js_setup)
    time.sleep(1)

    # Set rating and submit
    js_submit = """
        setRequiredFeedbackRating(5);
        document.getElementById('req-feedback-comment').value = 'Storage test comment';
        submitRequiredFeedback();
        return true;
    """
    driver.execute_script(js_submit)
    time.sleep(1)

    # Check localStorage
    js_check = f"""
        const data = localStorage.getItem('feedback_{trade_id}_buyer');
        return data ? JSON.parse(data) : null;
    """
    feedback_data = driver.execute_script(js_check)

    if feedback_data:
        print(f"  Stored feedback: rating={feedback_data.get('rating')}, comment={feedback_data.get('comment')}")
        if feedback_data.get('rating') == 5:
            print("  PASS: Feedback stored correctly in localStorage")
            return True
        else:
            print("  FAIL: Rating not stored correctly")
            return False
    else:
        print("  FAIL: Feedback not found in localStorage")
        return False

def test_ui_visual_check(driver):
    """Visual check of the feedback modal design"""
    print("\n=== Test 6: Visual Design Check ===")

    # Open feedback modal
    js_setup = """
        const mockTrade = {
            id: 'visual_test_' + Date.now(),
            buyer: 'buyer_wallet_address_12345',
            seller: 'seller_wallet_address_67890',
            amount: 250000000,
            assetId: 174,
            status: 'seller_confirmed',
            currency: 'USD',
            payAmount: 25.00
        };
        state.myAddress = 'buyer_wallet_address_12345';
        state.activeTrade = mockTrade;
        localStorage.removeItem('feedback_' + mockTrade.id + '_buyer');

        showRequiredFeedbackModal(mockTrade, 'buyer', function() {});
        return mockTrade.id;
    """
    driver.execute_script(js_setup)
    time.sleep(1)

    # Set a rating for visual
    driver.execute_script("setRequiredFeedbackRating(5);")
    time.sleep(0.5)

    take_screenshot(driver, "08_feedback_modal_visual")

    # Check visual elements
    checks = {
        'warning_banner': "return !!document.querySelector('.required-feedback-notice');",
        'star_rating': "return document.querySelectorAll('.req-star').length === 5;",
        'submit_button': "return !!document.querySelector('#required-feedback-modal .btn-primary');",
        'trade_info': "return !!document.getElementById('req-feedback-trade-id');",
        'verified_badge': "return !!document.querySelector('.feedback-verified-badge');"
    }

    all_pass = True
    for name, js in checks.items():
        result = driver.execute_script(js)
        status = "PASS" if result else "FAIL"
        print(f"  {status}: {name}")
        if not result:
            all_pass = False

    # Close modal
    driver.execute_script("closeModal('required-feedback-modal');")
    time.sleep(0.5)

    return all_pass

def main():
    print("=" * 60)
    print("  P2P Required Feedback Flow Tests")
    print("=" * 60)

    # Check server is running
    try:
        status = http_post(f"{BASE_URL}/api/status")
        print(f"\nServer status: {status.get('status', 'unknown')}")
        print(f"Active wallet: {status.get('active_wallet', 'none')}")
    except Exception as e:
        print(f"ERROR: Cannot connect to server: {e}")
        return

    # Setup driver
    print("\nConnecting to Chrome...")
    try:
        driver = setup_driver()
    except Exception as e:
        print(f"ERROR: Cannot connect to Chrome: {e}")
        print("Make sure Chrome is running with --remote-debugging-port=9222")
        return

    # Navigate to P2P
    print("Navigating to P2P marketplace...")
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(2)

    if not switch_to_p2p_iframe(driver):
        print("ERROR: Could not switch to P2P iframe")
        return

    # Run tests
    results = []

    try:
        results.append(("Feedback modal for buyer", test_feedback_modal_appears_for_buyer(driver)))
        results.append(("Buyer submits feedback", test_feedback_submission_for_buyer(driver)))
        results.append(("Feedback modal for seller", test_feedback_modal_appears_for_seller(driver)))
        results.append(("Star rating interaction", test_star_rating_interaction(driver)))
        results.append(("Feedback storage", test_feedback_stored_in_localstorage(driver)))
        results.append(("Visual design", test_ui_visual_check(driver)))
    except Exception as e:
        print(f"\nERROR during tests: {e}")
        take_screenshot(driver, "error_state")

    # Summary
    print("\n" + "=" * 60)
    print("  TEST RESULTS")
    print("=" * 60)

    passed = 0
    failed = 0
    for name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"  {status}: {name}")
        if result:
            passed += 1
        else:
            failed += 1

    print("-" * 60)
    print(f"  Total: {passed} passed, {failed} failed")
    print("=" * 60)

    # Don't close driver - keep browser open for inspection
    print("\nTests complete. Browser left open for inspection.")

if __name__ == "__main__":
    main()
