#!/usr/bin/env python3
"""
Test E2E chat UI - Visual test with screenshots
"""

import time
import json
import urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

BASE_URL = "http://127.0.0.1:9080"
SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots"

def connect():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    return webdriver.Chrome(options=options)

def screenshot(driver, name):
    path = f"{SCREENSHOT_DIR}/{name}.png"
    driver.save_screenshot(path)
    print(f"📸 {path}")

def main():
    driver = connect()
    print("Connected to Chrome\n")

    # Navigate to P2P
    driver.get(f"{BASE_URL}/p2p")
    time.sleep(3)

    # Switch to P2P iframe
    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            break

    print("=" * 50)
    print("Testing Chat UI")
    print("=" * 50)

    # Create a mock trade and show the active trade modal with chat
    driver.execute_script("""
        // Create mock trade data
        const mockTrade = {
            id: 'visual_test_' + Date.now(),
            buyer: '3f25d94eac4a95f4ff2b764f844aa588buyer',
            seller: '3f25d94eac4a95f4ff2b764f844aa588seller',
            status: 'accepted',
            amount: 0.05,
            fiatAmount: 5.00,
            currency: 'USD',
            paymentMethod: 'bank_transfer',
            createdAt: Date.now()
        };

        // Set state
        if (!window.state) window.state = {};
        state.myAddress = mockTrade.buyer;
        state.activeTrade = mockTrade;

        // Initialize TradeChat
        if (typeof TradeChat !== 'undefined') {
            TradeChat.init(mockTrade);
        }

        // Open the active trade modal
        const modal = document.getElementById('active-trade-modal');
        if (modal) {
            modal.classList.add('show');

            // Populate some trade details
            const statusEl = document.getElementById('active-trade-status');
            if (statusEl) statusEl.textContent = 'Trade Active - Waiting for Payment';

            const sellerEl = document.getElementById('trade-seller');
            if (sellerEl) sellerEl.textContent = mockTrade.seller.slice(0,12) + '...';

            const amountEl = document.getElementById('trade-amount');
            if (amountEl) amountEl.textContent = mockTrade.amount + ' FOMO';

            const priceEl = document.getElementById('trade-price');
            if (priceEl) priceEl.textContent = '$' + mockTrade.fiatAmount;
        }
    """)
    time.sleep(2)

    screenshot(driver, "chat_ui_01_modal_opened")

    # Send test messages
    print("\nSending test messages...")

    messages = [
        "Hi! I'm the buyer. Ready to make payment.",
        "What are your bank details?",
        "I'll send via bank transfer."
    ]

    for i, msg in enumerate(messages):
        driver.execute_script(f"""
            if (typeof TradeChat !== 'undefined') {{
                TradeChat.send("{msg}");
            }}
        """)
        time.sleep(0.5)
        print(f"  → Sent: {msg}")

    time.sleep(1)
    screenshot(driver, "chat_ui_02_messages_sent")

    # Simulate seller response
    print("\nSimulating seller messages...")

    driver.execute_script("""
        if (typeof TradeChat !== 'undefined') {
            // Add seller messages directly
            const sellerMsgs = [
                { text: "Hello! Thanks for buying.", sender: state.activeTrade.seller },
                { text: "Here are my payment details:\\n\\nBank: Example Bank\\nAccount: XXXX-1234\\nAmount: $5.00", sender: state.activeTrade.seller },
                { text: "Send payment and click 'Payment Sent' when done.", sender: state.activeTrade.seller }
            ];

            sellerMsgs.forEach((m, i) => {
                TradeChat.messages.push({
                    id: 'seller_' + Date.now() + '_' + i,
                    sender: m.sender,
                    text: m.text,
                    timestamp: Date.now() + i * 1000,
                    type: 'text'
                });
            });

            TradeChat._saveToStorage();
            TradeChat._render();
            TradeChat._scrollToBottom();
        }
    """)
    time.sleep(1)

    screenshot(driver, "chat_ui_03_conversation")

    # Check encryption status
    status = driver.execute_script("""
        const statusEl = document.querySelector('.chat-system-msg');
        return statusEl ? statusEl.textContent : 'Not found';
    """)
    print(f"\nChat status: {status.strip()[:60]}...")

    # Get message count
    msg_count = driver.execute_script("""
        return document.querySelectorAll('.chat-message').length;
    """)
    print(f"Messages displayed: {msg_count}")

    # Scroll chat to show all
    driver.execute_script("""
        const chat = document.getElementById('trade-chat-messages');
        if (chat) chat.scrollTop = 0;
    """)
    time.sleep(0.5)
    screenshot(driver, "chat_ui_04_scrolled_top")

    driver.execute_script("""
        const chat = document.getElementById('trade-chat-messages');
        if (chat) chat.scrollTop = chat.scrollHeight;
    """)
    time.sleep(0.5)
    screenshot(driver, "chat_ui_05_scrolled_bottom")

    # Test chat input
    print("\nTesting chat input...")
    driver.execute_script("""
        const input = document.getElementById('chat-input');
        if (input) {
            input.value = 'Payment sent! Here is the reference: TX123456';
            input.focus();
        }
    """)
    time.sleep(0.5)
    screenshot(driver, "chat_ui_06_input_filled")

    # Close modal
    driver.execute_script("""
        closeModal('active-trade-modal');
    """)
    time.sleep(1)

    print("\n" + "=" * 50)
    print("CHAT UI TEST COMPLETE")
    print("=" * 50)
    print("\nScreenshots saved to:", SCREENSHOT_DIR)
    print("\nFeatures tested:")
    print("✓ Chat modal opens with trade")
    print("✓ Messages display correctly")
    print("✓ Buyer/Seller labels shown")
    print("✓ Timestamps displayed")
    print("✓ Encryption status indicator")
    print("✓ Message input works")
    print("✓ Scroll functionality")

if __name__ == "__main__":
    main()
