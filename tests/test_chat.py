#!/usr/bin/env python3
"""
Test E2E encrypted chat between two wallets
"""

import time
import json
import urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import os

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots"

WALLETS = {
    "test_wallet": os.environ.get('BEAM_TEST_PASSWORD', ''),  # Seller
    "test_2": "123123"               # Buyer
}

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

def http_post(url, data=None):
    try:
        body = json.dumps(data).encode() if data else b''
        req = urllib.request.Request(url, data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"HTTP Error: {e}")
        return None

def switch_wallet(wallet_name):
    """Switch wallet via API"""
    print(f"\n--- Switching to {wallet_name} ---")

    # Lock current wallet
    http_post(f"{BASE_URL}/api/wallet/lock")
    time.sleep(1)

    # Unlock target wallet
    password = WALLETS[wallet_name]
    result = http_post(f"{BASE_URL}/api/wallet/unlock", {
        "wallet": wallet_name,
        "password": password
    })

    if result and result.get("success"):
        print(f"✓ Switched to {wallet_name}")
        return True
    else:
        print(f"✗ Failed to switch to {wallet_name}")
        return False

def navigate_to_p2p(driver):
    """Navigate to P2P page and switch to iframe"""
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)

    # Switch to P2P iframe
    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            print("✓ Switched to P2P iframe")
            return True
    return False

def get_chat_status(driver):
    """Get current chat encryption status"""
    try:
        status = driver.execute_script("""
            const msg = document.querySelector('.chat-system-msg');
            return msg ? msg.textContent : null;
        """)
        return status
    except:
        return None

def send_chat_message(driver, message):
    """Send a message in the chat"""
    try:
        driver.execute_script(f"""
            const input = document.getElementById('chat-input');
            if (input) {{
                input.value = "{message}";
                sendChatMessage();
            }}
        """)
        return True
    except Exception as e:
        print(f"Failed to send message: {e}")
        return False

def get_chat_messages(driver):
    """Get all chat messages"""
    try:
        messages = driver.execute_script("""
            const msgs = document.querySelectorAll('.chat-bubble p');
            return Array.from(msgs).map(m => m.textContent);
        """)
        return messages or []
    except:
        return []

def main():
    driver = connect()
    print("Connected to Chrome\n")

    # ==========================================
    # Step 1: Seller creates order
    # ==========================================
    print("=" * 50)
    print("STEP 1: Seller creates order")
    print("=" * 50)

    switch_wallet("test_wallet")
    navigate_to_p2p(driver)
    time.sleep(2)

    # Check if there's an existing order or create one
    order_count = driver.execute_script("""
        return document.querySelectorAll('.order-card').length;
    """)
    print(f"Existing orders: {order_count}")

    # Create a small test order if needed
    if order_count == 0:
        print("Creating test order...")
        driver.execute_script("""
            // Open create order modal
            document.querySelector('[onclick*="showCreateOrder"]')?.click();
        """)
        time.sleep(1)

    screenshot(driver, "chat_test_01_seller_view")

    # ==========================================
    # Step 2: Buyer accepts order and opens chat
    # ==========================================
    print("\n" + "=" * 50)
    print("STEP 2: Buyer accepts order")
    print("=" * 50)

    switch_wallet("test_2")
    time.sleep(2)

    # Refresh P2P page as buyer
    navigate_to_p2p(driver)
    time.sleep(3)

    screenshot(driver, "chat_test_02_buyer_view")

    # Click on first available order
    driver.execute_script("""
        const orders = document.querySelectorAll('.order-card');
        if (orders.length > 0) {
            orders[0].click();
        }
    """)
    time.sleep(2)

    screenshot(driver, "chat_test_03_order_details")

    # Check if we have an active trade modal with chat
    has_chat = driver.execute_script("""
        return document.getElementById('trade-chat-messages') !== null;
    """)

    if not has_chat:
        print("No active trade chat found. Looking for trade modal...")
        # Try to open active trade
        driver.execute_script("""
            if (typeof showActiveTrade === 'function') {
                // Find any active trade
                const trades = state?.myTrades?.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
                if (trades && trades.length > 0) {
                    showActiveTrade(trades[0]);
                }
            }
        """)
        time.sleep(2)

    # ==========================================
    # Step 3: Test chat functionality
    # ==========================================
    print("\n" + "=" * 50)
    print("STEP 3: Testing chat encryption")
    print("=" * 50)

    # Check chat status
    chat_status = get_chat_status(driver)
    print(f"Chat status: {chat_status}")

    screenshot(driver, "chat_test_04_chat_view")

    # Initialize chat manually for testing
    print("\nInitializing TradeChat...")
    driver.execute_script("""
        // Create a mock trade for testing
        if (typeof TradeChat !== 'undefined') {
            const mockTrade = {
                id: 'test_trade_' + Date.now(),
                buyer: 'buyer_address_123',
                seller: 'seller_address_456',
                status: 'accepted'
            };

            // Set state for testing
            if (!window.state) window.state = {};
            state.myAddress = 'buyer_address_123';
            state.activeTrade = mockTrade;

            TradeChat.init(mockTrade);
        }
    """)
    time.sleep(3)

    # Check encryption status
    chat_status = get_chat_status(driver)
    print(f"Chat status after init: {chat_status}")

    screenshot(driver, "chat_test_05_chat_initialized")

    # ==========================================
    # Step 4: Send test message from buyer
    # ==========================================
    print("\n" + "=" * 50)
    print("STEP 4: Buyer sends message")
    print("=" * 50)

    test_message = "Hello! This is a test message from buyer."

    driver.execute_script(f"""
        if (typeof TradeChat !== 'undefined' && TradeChat.tradeId) {{
            TradeChat.send("{test_message}");
        }}
    """)
    time.sleep(1)

    messages = get_chat_messages(driver)
    print(f"Messages in chat: {messages}")

    screenshot(driver, "chat_test_06_buyer_message")

    # ==========================================
    # Step 5: Check message storage
    # ==========================================
    print("\n" + "=" * 50)
    print("STEP 5: Verify message storage")
    print("=" * 50)

    stored_messages = driver.execute_script("""
        if (typeof TradeChat !== 'undefined') {
            return {
                tradeId: TradeChat.tradeId,
                messages: TradeChat.messages,
                hasSharedKey: !!TradeChat.sharedKey,
                peerVerified: TradeChat.peerVerified,
                isInitialized: TradeChat.isInitialized
            };
        }
        return null;
    """)

    print(f"TradeChat state:")
    print(f"  - Trade ID: {stored_messages.get('tradeId') if stored_messages else 'N/A'}")
    print(f"  - Messages: {len(stored_messages.get('messages', [])) if stored_messages else 0}")
    print(f"  - Has shared key: {stored_messages.get('hasSharedKey') if stored_messages else False}")
    print(f"  - Peer verified: {stored_messages.get('peerVerified') if stored_messages else False}")
    print(f"  - Initialized: {stored_messages.get('isInitialized') if stored_messages else False}")

    # ==========================================
    # Step 6: Test encryption
    # ==========================================
    print("\n" + "=" * 50)
    print("STEP 6: Test encryption/decryption")
    print("=" * 50)

    encryption_test = driver.execute_script("""
        if (typeof TradeChat !== 'undefined' && TradeChat.sharedKey) {
            return (async () => {
                const testText = "Secret payment details: BTC address xyz123";
                const { encrypted, iv } = await TradeChat._encrypt(testText);
                const decrypted = await TradeChat._decrypt(encrypted, iv);
                return {
                    original: testText,
                    encrypted: encrypted.substring(0, 50) + '...',
                    decrypted: decrypted,
                    match: testText === decrypted
                };
            })();
        }
        return { error: 'No shared key yet' };
    """)
    time.sleep(1)

    # Get the result
    encryption_result = driver.execute_script("return window._encryptionTestResult;")
    if encryption_test:
        print(f"Encryption test: {encryption_test}")

    screenshot(driver, "chat_test_07_final")

    # ==========================================
    # Summary
    # ==========================================
    print("\n" + "=" * 50)
    print("CHAT TEST SUMMARY")
    print("=" * 50)

    checks = {
        "TradeChat initialized": stored_messages is not None,
        "Messages stored": len(stored_messages.get('messages', [])) > 0 if stored_messages else False,
        "Encryption ready": stored_messages.get('hasSharedKey', False) if stored_messages else False,
    }

    all_passed = all(checks.values())

    for check, passed in checks.items():
        icon = "✓" if passed else "✗"
        print(f"{icon} {check}")

    print("\n" + "=" * 50)
    if all_passed:
        print("CHAT TEST PASSED!")
    else:
        print("CHAT TEST NEEDS ATTENTION")
        print("Note: Full encryption requires both parties online")
    print("=" * 50)

if __name__ == "__main__":
    main()
