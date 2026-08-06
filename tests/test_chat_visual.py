#!/usr/bin/env python3
"""
Visual test for chat - shows the chat section clearly
"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

# Derived from this file, not hardcoded: an absolute path here embedded the
# developer's real name in a public repository.
import os as _os
REPO_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))

SCREENSHOT_DIR = "" + REPO_ROOT + "//tests/screenshots"

def main():
    options = Options()
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    driver = webdriver.Chrome(options=options)

    driver.get("http://127.0.0.1:9080/p2p")
    time.sleep(2)

    for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
        if "p2p" in (iframe.get_attribute("src") or ""):
            driver.switch_to.frame(iframe)
            break

    # Initialize chat with test data
    js_code = """
        const mockTrade = {
            id: 'visual_chat_test',
            buyer: 'buyer_wallet_address_123',
            seller: 'seller_wallet_address_456',
            status: 'accepted'
        };

        if (!window.state) window.state = {};
        state.myAddress = 'buyer_wallet_address_123';
        state.activeTrade = mockTrade;

        if (typeof TradeChat !== 'undefined') {
            TradeChat.init(mockTrade);

            // Add conversation
            TradeChat.messages = [
                {id: '1', sender: 'buyer_wallet_address_123', text: 'Hi! Ready to buy FOMO.', timestamp: Date.now() - 300000, type: 'text'},
                {id: '2', sender: 'seller_wallet_address_456', text: 'Great! Here are my payment details:', timestamp: Date.now() - 240000, type: 'text'},
                {id: '3', sender: 'seller_wallet_address_456', text: 'Bank: Example Bank\\nAccount: ****1234\\nSend: $5.00 USD', timestamp: Date.now() - 180000, type: 'text'},
                {id: '4', sender: 'buyer_wallet_address_123', text: 'Payment sent! Reference: TX98765', timestamp: Date.now() - 60000, type: 'text'},
                {id: '5', sender: 'seller_wallet_address_456', text: 'Received! Releasing FOMO now...', timestamp: Date.now(), type: 'text'}
            ];

            TradeChat._render();
            TradeChat._scrollToBottom();
        }

        // Open modal
        const modal = document.getElementById('active-trade-modal');
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
        }

        // Scroll modal to chat
        setTimeout(function() {
            const chat = document.getElementById('trade-chat');
            if (chat) {
                chat.scrollIntoView({behavior: 'instant', block: 'start'});
            }
        }, 500);
    """

    driver.execute_script(js_code)
    time.sleep(2)

    # Take screenshot
    path = f"{SCREENSHOT_DIR}/chat_full_conversation.png"
    driver.save_screenshot(path)
    print(f"Screenshot: {path}")

    # Get chat info
    info = driver.execute_script("""
        return {
            messageCount: TradeChat.messages.length,
            hasKey: !!TradeChat.sharedKey,
            isInit: TradeChat.isInitialized
        };
    """)
    print(f"Chat info: {info}")

    # Close modal
    driver.execute_script("closeModal('active-trade-modal');")

    print("Done!")

if __name__ == "__main__":
    main()
