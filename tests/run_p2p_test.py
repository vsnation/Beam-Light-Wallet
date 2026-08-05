#!/usr/bin/env python3
"""P2P Marketplace UI/UX Testing"""
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time
import os

os.makedirs('/tmp/p2p_test', exist_ok=True)

# Connect to Chrome debug session
options = Options()
options.add_experimental_option('debuggerAddress', '127.0.0.1:9222')
driver = webdriver.Chrome(options=options)
print('Connected to Chrome')
print('='*60)

# Navigate to wallet then P2P
driver.get('http://127.0.0.1:9080/')
time.sleep(2)

# Close any open modals
for modal in driver.find_elements(By.CSS_SELECTOR, '.modal-overlay.active'):
    try:
        close_btn = modal.find_element(By.CSS_SELECTOR, '.modal-close, .close-btn')
        driver.execute_script('arguments[0].click();', close_btn)
        time.sleep(0.3)
    except: pass

# Click P2P nav
p2p_nav = driver.find_element(By.CSS_SELECTOR, '[data-page="p2p"]')
driver.execute_script('arguments[0].click();', p2p_nav)
time.sleep(2)

# Switch to iframe if present
iframes = driver.find_elements(By.TAG_NAME, 'iframe')
if iframes:
    print(f'Found {len(iframes)} iframe(s), switching to first one')
    driver.switch_to.frame(iframes[0])
    time.sleep(1)

results = []
screenshots = []

def log_result(name, passed, msg=''):
    status = '✓ PASS' if passed else '✗ FAIL'
    result = f'{status}: {name}'
    if msg:
        result += f' - {msg}'
    print(result)
    results.append({'name': name, 'passed': passed})

def screenshot(name):
    path = f'/tmp/p2p_test/{len(screenshots)+1:02d}_{name}.png'
    driver.save_screenshot(path)
    screenshots.append(path)
    print(f'  Screenshot: {path}')

# ========== P2P MARKETPLACE UI/UX TESTS ==========
print('\n=== P2P MARKETPLACE UI/UX TESTING ===\n')

# 1. PAGE STRUCTURE
print('--- Page Structure ---')
header = driver.find_elements(By.CSS_SELECTOR, '.p2p-header')
log_result('Header present', len(header) > 0)

title = driver.find_elements(By.CSS_SELECTOR, '.p2p-header h1')
if title:
    log_result('Title text', True, title[0].text)
    bg = title[0].value_of_css_property('background-image')
    log_result('Title has gradient', 'gradient' in bg.lower())

header_btns = driver.find_elements(By.CSS_SELECTOR, '.header-actions .icon-btn')
log_result('Header action buttons', len(header_btns) >= 4, f'Found {len(header_btns)}')

contract_info = driver.find_elements(By.ID, 'contract-info')
log_result('Contract info section', len(contract_info) > 0)

contract_cid = driver.find_elements(By.ID, 'contract-cid')
if contract_cid:
    cid_text = contract_cid[0].text
    log_result('Contract ID displayed', len(cid_text) > 10, f'{cid_text[:30]}...' if len(cid_text) > 30 else cid_text)

screenshot('page_structure')

# 2. BUY/SELL TOGGLE
print('\n--- Buy/Sell Toggle ---')
buy_btn = driver.find_elements(By.ID, 'btn-buy')
sell_btn = driver.find_elements(By.ID, 'btn-sell')
log_result('Buy button present', len(buy_btn) > 0)
log_result('Sell button present', len(sell_btn) > 0)

if buy_btn and sell_btn:
    buy_class = buy_btn[0].get_attribute('class')
    log_result('Buy button active by default', 'active' in buy_class)

    driver.execute_script('arguments[0].click();', sell_btn[0])
    time.sleep(0.3)
    sell_class = sell_btn[0].get_attribute('class')
    log_result('Sell toggle works', 'active' in sell_class)

    sell_bg = sell_btn[0].value_of_css_property('background-color')
    log_result('Sell button is red', 'ef44' in sell_bg or '239, 68' in sell_bg or '239,' in sell_bg, sell_bg[:40])

    screenshot('sell_mode')

    driver.execute_script('arguments[0].click();', buy_btn[0])
    time.sleep(0.3)
    buy_bg = buy_btn[0].value_of_css_property('background-color')
    log_result('Buy button is green', '192, 135' in buy_bg or 'c087' in buy_bg or '0, 192' in buy_bg, buy_bg[:40])

# 3. ASSET TABS
print('\n--- Asset Tabs ---')
asset_tabs = driver.find_elements(By.CSS_SELECTOR, '.asset-tab')
log_result('Asset tabs present', len(asset_tabs) >= 3, f'Found {len(asset_tabs)}')

for tab in asset_tabs:
    tab_name = tab.text
    driver.execute_script('arguments[0].click();', tab)
    time.sleep(0.2)
    is_active = 'active' in tab.get_attribute('class')
    log_result(f'Tab "{tab_name}" selectable', is_active)

# 4. FILTERS
print('\n--- Filters ---')
amount_input = driver.find_elements(By.ID, 'amount-input')
log_result('Amount filter input', len(amount_input) > 0)

currency_select = driver.find_elements(By.ID, 'currency-select')
log_result('Currency select', len(currency_select) > 0)
if currency_select:
    options = currency_select[0].find_elements(By.TAG_NAME, 'option')
    log_result('Currency options', len(options) >= 3, [opt.text for opt in options])

payment_dropdown = driver.find_elements(By.ID, 'payment-dropdown')
log_result('Payment dropdown', len(payment_dropdown) > 0)

if payment_dropdown:
    trigger = payment_dropdown[0].find_element(By.CSS_SELECTOR, '.dropdown-trigger')
    driver.execute_script('arguments[0].click();', trigger)
    time.sleep(0.3)

    dropdown_content = driver.find_elements(By.CSS_SELECTOR, '#payment-dropdown-content.show')
    log_result('Payment dropdown opens', len(dropdown_content) > 0)

    if dropdown_content:
        screenshot('payment_dropdown')
        methods = dropdown_content[0].find_elements(By.CSS_SELECTOR, '.dropdown-item')
        log_result('Payment methods listed', len(methods) >= 5, f'{len(methods)} methods')

    driver.execute_script('arguments[0].click();', trigger)
    time.sleep(0.2)

refresh_btn = driver.find_elements(By.CSS_SELECTOR, '.refresh-btn')
log_result('Refresh button', len(refresh_btn) > 0)

# 5. WARNING BANNER
print('\n--- Warning Banner ---')
warning = driver.find_elements(By.CSS_SELECTOR, '.warning-banner')
log_result('Warning banner displayed', len(warning) > 0)
if warning:
    warning_text = warning[0].text[:100]
    log_result('Warning has text', len(warning_text) > 20, warning_text)

# 6. ORDERS LIST
print('\n--- Orders List ---')
orders_container = driver.find_elements(By.CSS_SELECTOR, '.orders-container')
log_result('Orders container', len(orders_container) > 0)

orders_header = driver.find_elements(By.CSS_SELECTOR, '.orders-header')
log_result('Orders header', len(orders_header) > 0)

if orders_header:
    columns = orders_header[0].find_elements(By.CSS_SELECTOR, 'div')
    log_result('Header columns', len(columns) >= 5, f'{len(columns)} columns')

orders_list = driver.find_elements(By.ID, 'orders-list')
if orders_list:
    loading = orders_list[0].find_elements(By.CSS_SELECTOR, '.loading-orders')
    order_rows = orders_list[0].find_elements(By.CSS_SELECTOR, '.order-row')

    if loading and loading[0].is_displayed():
        log_result('Loading indicator shown', True)
    else:
        log_result('Orders displayed', True, f'{len(order_rows)} orders')

screenshot('orders_list')

# 7. BOTTOM ACTIONS
print('\n--- Bottom Actions ---')
bottom_actions = driver.find_elements(By.CSS_SELECTOR, '.bottom-actions')
log_result('Bottom actions area', len(bottom_actions) > 0)

action_btns = driver.find_elements(By.CSS_SELECTOR, '.action-btn')
log_result('Action buttons', len(action_btns) >= 3, f'{len(action_btns)} buttons')

btn_texts = [btn.text.lower() for btn in action_btns]
log_result('Create Order button', any('create' in t for t in btn_texts))
log_result('My Trades button', any('trade' in t for t in btn_texts))
log_result('Escrow Staking button', any('escrow' in t for t in btn_texts))

# 8. CREATE ORDER MODAL
print('\n--- Create Order Modal ---')
create_btn = None
for btn in action_btns:
    if 'create' in btn.text.lower():
        create_btn = btn
        break

if create_btn:
    driver.execute_script('arguments[0].click();', create_btn)
    time.sleep(0.5)

    modal = driver.find_elements(By.CSS_SELECTOR, '#create-order-modal.show')
    log_result('Create Order modal opens', len(modal) > 0)

    if modal:
        screenshot('create_order_modal')

        amount_inp = modal[0].find_elements(By.ID, 'create-amount')
        log_result('Amount input', len(amount_inp) > 0)

        price_inp = modal[0].find_elements(By.ID, 'create-price')
        log_result('Price input', len(price_inp) > 0)

        asset_sel = modal[0].find_elements(By.ID, 'create-asset')
        log_result('Asset selector', len(asset_sel) > 0)

        payment_checks = modal[0].find_elements(By.CSS_SELECTOR, '.payment-checkboxes .checkbox-item')
        log_result('Payment method checkboxes', len(payment_checks) >= 3, f'{len(payment_checks)}')

        summary = modal[0].find_elements(By.CSS_SELECTOR, '.order-summary')
        log_result('Order summary section', len(summary) > 0)

        terms = modal[0].find_elements(By.ID, 'create-terms')
        log_result('Terms checkbox', len(terms) > 0)

        close_btn = modal[0].find_element(By.CSS_SELECTOR, '.modal-close')
        driver.execute_script('arguments[0].click();', close_btn)
        time.sleep(0.3)

# 9. MY TRADES MODAL
print('\n--- My Trades Modal ---')
trades_btn = None
for btn in action_btns:
    if 'trade' in btn.text.lower():
        trades_btn = btn
        break

if trades_btn:
    driver.execute_script('arguments[0].click();', trades_btn)
    time.sleep(0.5)

    modal = driver.find_elements(By.CSS_SELECTOR, '#my-trades-modal.show')
    log_result('My Trades modal opens', len(modal) > 0)

    if modal:
        screenshot('my_trades_modal')

        tabs = modal[0].find_elements(By.CSS_SELECTOR, '.trades-tab')
        log_result('Trade tabs', len(tabs) >= 2, f'{len(tabs)} tabs')

        for tab in tabs:
            driver.execute_script('arguments[0].click();', tab)
            time.sleep(0.2)
            is_active = 'active' in tab.get_attribute('class')
            log_result(f'Tab "{tab.text}" works', is_active)

        close_btn = modal[0].find_element(By.CSS_SELECTOR, '.modal-close')
        driver.execute_script('arguments[0].click();', close_btn)
        time.sleep(0.3)

# 10. ESCROW STAKING MODAL
print('\n--- Escrow Staking Modal ---')
escrow_btn = None
for btn in action_btns:
    if 'escrow' in btn.text.lower():
        escrow_btn = btn
        break

if escrow_btn:
    driver.execute_script('arguments[0].click();', escrow_btn)
    time.sleep(0.5)

    modal = driver.find_elements(By.CSS_SELECTOR, '#escrow-modal.show')
    log_result('Escrow Staking modal opens', len(modal) > 0)

    if modal:
        screenshot('escrow_staking_modal')

        stats = modal[0].find_elements(By.CSS_SELECTOR, '.stat-card')
        log_result('Stats cards', len(stats) >= 3, f'{len(stats)} cards')

        info = modal[0].find_elements(By.CSS_SELECTOR, '.escrow-info')
        log_result('Escrow info section', len(info) > 0)

        stake_inp = modal[0].find_elements(By.ID, 'escrow-stake-amount')
        log_result('Stake amount input', len(stake_inp) > 0)

        close_btn = modal[0].find_element(By.CSS_SELECTOR, '.modal-close')
        driver.execute_script('arguments[0].click();', close_btn)
        time.sleep(0.3)

# 11. RESPONSIVE DESIGN
print('\n--- Responsive Design ---')
sizes = [(1920, 1080, 'desktop'), (768, 1024, 'tablet'), (375, 812, 'mobile')]

for w, h, name in sizes:
    driver.set_window_size(w, h)
    time.sleep(0.5)

    orders_header = driver.find_elements(By.CSS_SELECTOR, '.orders-header')
    if orders_header:
        display = orders_header[0].value_of_css_property('display')
        if name == 'mobile':
            log_result(f'{name}: Orders header hidden', display == 'none', display)
        else:
            log_result(f'{name}: Orders header visible', display != 'none', display)

    screenshot(f'responsive_{name}')

driver.set_window_size(1920, 1080)

# 12. VISUAL CONSISTENCY
print('\n--- Visual Consistency ---')
body = driver.find_element(By.TAG_NAME, 'body')
bg = body.value_of_css_property('background-color')
log_result('Dark theme applied', '10, 14' in bg or '5, 10' in bg or '0, 14' in bg, bg)

font = body.value_of_css_property('font-family')
log_result('Outfit font applied', 'outfit' in font.lower(), font[:50])

primary_btns = driver.find_elements(By.CSS_SELECTOR, '.btn-primary')
if primary_btns:
    btn_bg = primary_btns[0].value_of_css_property('background-color')
    log_result('Primary button accent color', '37, 194' in btn_bg or '192, 160' in btn_bg, btn_bg)

# 13. HEADER ACTION MODALS
print('\n--- Header Action Modals ---')
for i, btn in enumerate(header_btns[:4]):
    title = btn.get_attribute('title') or f'Button_{i}'
    driver.execute_script('arguments[0].click();', btn)
    time.sleep(0.5)

    open_modals = driver.find_elements(By.CSS_SELECTOR, '.modal.show')
    if open_modals:
        log_result(f'{title} modal', True)
        safe_title = title.replace(' ', '_').replace('/', '_').lower()
        screenshot(f'header_{safe_title}')
        close = open_modals[0].find_element(By.CSS_SELECTOR, '.modal-close')
        driver.execute_script('arguments[0].click();', close)
        time.sleep(0.3)
    else:
        log_result(f'{title} modal', False, 'No modal opened')

# Switch back to main content
driver.switch_to.default_content()

# ========== SUMMARY ==========
print('\n' + '='*60)
print('P2P MARKETPLACE TEST SUMMARY')
print('='*60)

passed = sum(1 for r in results if r['passed'])
failed = sum(1 for r in results if not r['passed'])
total = len(results)

print(f'\nTotal Tests: {total}')
print(f'Passed: {passed}')
print(f'Failed: {failed}')
print(f'Pass Rate: {passed/total*100:.1f}%' if total > 0 else 'N/A')
print(f'Screenshots: {len(screenshots)}')

if failed > 0:
    print('\n--- Failed Tests ---')
    for r in results:
        if not r['passed']:
            print(f'  ✗ {r["name"]}')

print('\n--- Screenshots Location ---')
print('/tmp/p2p_test/')
for s in screenshots:
    print(f'  - {s}')

print('\n' + '='*60)
