#!/usr/bin/env python3
"""Debug script to examine page structure"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By

# Connect to Chrome
options = webdriver.ChromeOptions()
options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
driver = webdriver.Chrome(options=options)

print(f"URL: {driver.current_url}")
print(f"Title: {driver.title}")

# Check for iframes
iframes = driver.find_elements(By.TAG_NAME, "iframe")
print(f"\nIframes found: {len(iframes)}")
for i, iframe in enumerate(iframes):
    print(f"  iframe {i}: src={iframe.get_attribute('src')}, id={iframe.get_attribute('id')}")

# If there's an iframe, switch to it
if iframes:
    print("\nSwitching to iframe...")
    driver.switch_to.frame(iframes[0])

# List all buttons
print("\n=== ALL BUTTONS ===")
buttons = driver.find_elements(By.TAG_NAME, "button")
print(f"Found {len(buttons)} buttons:")
for btn in buttons[:20]:  # First 20
    text = btn.text.strip()[:30] if btn.text else "[no text]"
    onclick = btn.get_attribute("onclick") or ""
    classes = btn.get_attribute("class") or ""
    visible = btn.is_displayed()
    print(f"  {'✓' if visible else '✗'} '{text}' - class='{classes[:40]}' onclick='{onclick[:30]}'")

# Check specific elements
print("\n=== CHECKING SPECIFIC ELEMENTS ===")
selectors = [
    "#btn-buy",
    "#btn-sell",
    ".toggle-btn",
    ".action-btn",
    ".action-btn-primary",
    ".action-btn-secondary",
    ".icon-btn",
    "#create-order-modal",
    "#my-trades-modal",
    "#escrow-modal",
    "#manager-menu-btn",
]

for sel in selectors:
    try:
        els = driver.find_elements(By.CSS_SELECTOR, sel)
        if els:
            visible_count = sum(1 for e in els if e.is_displayed())
            print(f"  ✓ {sel}: {len(els)} found, {visible_count} visible")
        else:
            print(f"  ✗ {sel}: NOT FOUND")
    except Exception as e:
        print(f"  ✗ {sel}: ERROR - {e}")

# Try executing JS
print("\n=== JAVASCRIPT TEST ===")
try:
    result = driver.execute_script("return typeof showCreateOrder")
    print(f"  showCreateOrder: {result}")
    result = driver.execute_script("return typeof showMyTrades")
    print(f"  showMyTrades: {result}")
    result = driver.execute_script("return typeof showEscrowStaking")
    print(f"  showEscrowStaking: {result}")
except Exception as e:
    print(f"  JS Error: {e}")

print("\n=== PAGE SOURCE EXCERPT ===")
source = driver.page_source
# Find action buttons
if "Create Order" in source:
    idx = source.find("Create Order")
    print(source[max(0,idx-200):idx+200])
