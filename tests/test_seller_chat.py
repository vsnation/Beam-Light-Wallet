#!/usr/bin/env python3
"""
Show chat from seller's perspective
"""

import time
import json
import urllib.request
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import os

SCREENSHOT_DIR = "/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests/screenshots"

def http_post(url, data=None):
    body = json.dumps(data).encode() if data else b''
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def main():
    # Switch to seller wallet
    print("Switching to seller wallet (test_wallet)...")
    http_post('http://127.0.0.1:9080/api/wallet/lock')
    time.sleep(1)
    result = http_post('http://127.0.0.1:9080/api/wallet/unlock', {
        'wallet': 'test_wallet',
        'password': os.environ.get('BEAM_TEST_PASSWORD', '')
    })
    print(f"Result: {result}")

    # Connect to browser
    options = Options()
    options.add_experimental_option('debuggerAddress', '127.0.0.1:9222')
    driver = webdriver.Chrome(options=options)

    driver.get('http://127.0.0.1:9080/p2p')
    time.sleep(2)

    for iframe in driver.find_elements(By.TAG_NAME, 'iframe'):
        if 'p2p' in (iframe.get_attribute('src') or ''):
            driver.switch_to.frame(iframe)
            break

    # Show seller's chat view
    js_init = """
        const mockTrade = {
            id: 'seller_chat_demo',
            buyer: 'buyer_addr',
            seller: 'seller_addr',
            status: 'payment_sent'
        };

        if (!window.state) window.state = {};
        state.myAddress = 'seller_addr';
        state.activeTrade = mockTrade;

        if (typeof TradeChat !== 'undefined') {
            TradeChat.init(mockTrade);
        }
    """
    driver.execute_script(js_init)
    time.sleep(1)

    # Add messages from seller's perspective
    js_messages = """
        if (typeof TradeChat !== 'undefined') {
            TradeChat.messages = [
                {id: '1', sender: 'buyer_addr', text: 'Hi! I want to buy 0.05 FOMO', timestamp: Date.now() - 600000, type: 'text'},
                {id: '2', sender: 'seller_addr', text: 'Hello! Here are my payment details:', timestamp: Date.now() - 540000, type: 'text'},
                {id: '3', sender: 'seller_addr', text: 'Bank: My Private Bank\\nAccount: ****5678\\nAmount: $5.00 USD', timestamp: Date.now() - 480000, type: 'text'},
                {id: '4', sender: 'buyer_addr', text: 'Got it! Sending payment now...', timestamp: Date.now() - 300000, type: 'text'},
                {id: '5', sender: 'buyer_addr', text: 'Done! Bank reference: TXN-98765', timestamp: Date.now() - 180000, type: 'text'},
                {id: '6', sender: 'seller_addr', text: 'Checking my account...', timestamp: Date.now() - 60000, type: 'text'},
                {id: '7', sender: 'seller_addr', text: 'Received! Releasing FOMO to you now.', timestamp: Date.now(), type: 'text'}
            ];
            TradeChat._render();
            TradeChat._scrollToBottom();
        }
    """
    driver.execute_script(js_messages)
    time.sleep(0.5)

    # Open modal
    js_modal = """
        const modal = document.getElementById('active-trade-modal');
        if (modal) {
            modal.classList.add('show');
            const statusEl = document.getElementById('active-trade-status');
            if (statusEl) statusEl.textContent = 'Buyer Paid - Confirm Receipt';
        }
    """
    driver.execute_script(js_modal)
    time.sleep(0.5)

    # Scroll to chat
    js_scroll = """
        const chat = document.getElementById('trade-chat');
        if (chat) chat.scrollIntoView({behavior: 'instant', block: 'start'});
    """
    driver.execute_script(js_scroll)
    time.sleep(1)

    # Screenshot
    path = f"{SCREENSHOT_DIR}/chat_seller_perspective.png"
    driver.save_screenshot(path)
    print(f"Screenshot saved: {path}")

    # Show chat info
    info = driver.execute_script("""
        return {
            myAddress: state.myAddress,
            tradeId: TradeChat.tradeId,
            messageCount: TradeChat.messages.length,
            lastMessage: TradeChat.messages[TradeChat.messages.length - 1]?.text
        };
    """)
    print(f"\nSeller view info:")
    print(f"  My address: {info.get('myAddress')}")
    print(f"  Messages: {info.get('messageCount')}")
    print(f"  Last msg: {info.get('lastMessage')}")

    # Close
    driver.execute_script("closeModal('active-trade-modal');")
    print("\nDone!")

if __name__ == "__main__":
    main()
