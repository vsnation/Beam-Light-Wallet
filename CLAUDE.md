# CLAUDE.md - BEAM Light Wallet

This file provides comprehensive guidance for Claude Code when working with the BEAM Light Wallet project.

## Project Overview

**BEAM Light Wallet** is a fully decentralized desktop/browser wallet for BEAM Privacy blockchain. It runs entirely locally using official BEAM CLI binaries, with no backend servers required.

**Developer:** @vsnation
**Repository:** https://github.com/vsnation/Beam-Light-Wallet
**BEAM Binary Version:** 7.5.13882

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (UI)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  index.html + app.js + CSS                               │    │
│  │  - Wallet dashboard, Send, Receive, DEX, Settings        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                    HTTP (localhost:9080)                         │
└──────────────────────────────┼───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                        serve.py                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Python HTTP Server + Wallet Manager                     │    │
│  │  - Serves static files (src/)                            │    │
│  │  - Manages wallet lifecycle (create/restore/unlock/lock) │    │
│  │  - Proxies JSON-RPC to wallet-api                        │    │
│  │  - Manages beam-node process                             │    │
│  │  - Injects DEX shader for contract calls                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                    JSON-RPC (localhost:10000)                    │
└──────────────────────────────┼───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                      wallet-api (BEAM binary)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Official BEAM wallet API                                │    │
│  │  - Manages wallet.db (encrypted SQLite)                  │    │
│  │  - Signs transactions                                    │    │
│  │  - Executes smart contracts                              │    │
│  │  - Connects to BEAM nodes                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│              TCP (mainnet:8100 or localhost:10005)               │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
           ┌────────▼────────┐   ┌────────▼────────┐
           │  Public Nodes   │   │  Local Node     │
           │  eu-node01...   │   │  beam-node      │
           │  (remote)       │   │  (port 10005)   │
           └─────────────────┘   └─────────────────┘
```

## Directory Structure

```
LightWallet/
├── serve.py                 # Main server (1160 lines) - THE BRAIN
├── install.sh               # One-click installer & launcher
├── README.md                # User documentation
├── LICENSE                  # MIT License
├── CLAUDE.md                # This file
│
├── src/                     # Frontend application
│   ├── index.html           # Entry point
│   ├── js/
│   │   ├── app.js           # Main application (7000+ lines)
│   │   ├── api.js           # API client (203 lines)
│   │   ├── config.js        # Constants & asset config
│   │   ├── state.js         # Reactive state management
│   │   ├── utils.js         # Helper functions
│   │   ├── dex-shader.js    # DEX contract ABI
│   │   ├── pages/           # Page modules
│   │   │   ├── dex.js       # DEX swap page
│   │   │   ├── send.js      # Send transaction
│   │   │   ├── receive.js   # Receive/addresses
│   │   │   ├── transactions.js
│   │   │   └── settings.js  # Settings & node switching
│   │   └── components/      # UI components
│   │       ├── modals.js
│   │       ├── navigation.js
│   │       └── toasts.js
│   └── css/
│       ├── variables.css    # CSS custom properties
│       ├── base.css         # Reset & typography
│       ├── styles.css       # Component styles
│       └── welcome.css      # Unlock screen styles
│
├── config/
│   ├── nodes.json           # Network node addresses
│   └── assets.json          # Known asset metadata
│
├── shaders/
│   └── amm_app.wasm         # DEX smart contract ABI
│
├── binaries/                # BEAM CLI binaries (gitignored)
│   ├── macos/
│   │   ├── wallet-api       # JSON-RPC server
│   │   ├── beam-wallet      # CLI wallet tool
│   │   └── beam-node        # Full node
│   ├── linux/
│   └── windows/
│
├── wallets/                 # Wallet databases (gitignored)
│   └── {wallet_name}/
│       └── wallet.db        # Encrypted SQLite
│
├── logs/                    # Process logs (gitignored)
│
├── tests/
│   ├── test_launch.sh       # Bash test suite
│   └── run_tests.sh         # Test runner
│
└── build/
    ├── macos/
    │   ├── create-dmg.sh    # DMG builder
    │   ├── create-icon.sh   # Icon generator
    │   └── BEAM-LightWallet-1.0.0.dmg
    ├── linux/
    │   └── install-ubuntu.sh
    └── windows/
        └── install.bat
```

## Key Files Deep Dive

### serve.py - The Server Brain

**Purpose:** HTTP server that manages everything - wallet lifecycle, API proxy, process management.

**Key Endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/status` | Server status, active wallet, node info |
| GET | `/api/wallets` | List available wallets |
| GET | `/api/heartbeat` | Health check (kept for compatibility) |
| GET | `/api/node/status` | Local node sync progress |
| POST | `/api/wallet/create` | Create new wallet → returns seed phrase |
| POST | `/api/wallet/restore` | Restore from 12-word seed |
| POST | `/api/wallet/unlock` | Start wallet-api for a wallet |
| POST | `/api/wallet/lock` | Stop wallet-api |
| POST | `/api/wallet/rescan` | Trigger balance recovery |
| POST | `/api/wallet/export_owner_key` | Export owner viewer key |
| DELETE | `/api/wallet/{name}` | Delete wallet |
| POST | `/api/node/start` | Start local beam-node |
| POST | `/api/node/stop` | Stop local beam-node |
| POST | `/api/node/switch` | Switch public/local node |
| POST | `/api/wallet` | Proxy to wallet-api JSON-RPC |

**Key Functions:**

```python
# Wallet Management
create_wallet(wallet_name, password)      # Runs beam-wallet init
restore_wallet(name, password, seed)      # Runs beam-wallet restore
start_wallet_api(name, password, node)    # Launches wallet-api subprocess
stop_wallet_api()                         # Kills wallet-api process
export_owner_key(name, password)          # Gets owner viewer key

# Node Management
start_beam_node(owner_key, password)      # Launches local node with fast_sync
stop_beam_node()                          # Kills node process
get_node_sync_status()                    # Parses node log for sync %
switch_to_local_node(password, wallet)    # Full switch workflow

# API Proxy
proxy_to_wallet_api()                     # Forwards JSON-RPC, injects DEX shader
```

**Important Patterns:**

```python
# DEX Shader Injection - automatically adds shader bytes for DEX calls
if 'invoke_contract' in data.get('method', ''):
    args = data.get('params', {}).get('args', '')
    if DEX_CONTRACT_ID in args and DEX_SHADER:
        data['params']['contract'] = DEX_SHADER

# Password Error Detection
if "invalid password" in output.lower() or "File is not a database" in output:
    return {"error": True, "message": "Invalid password"}

# Wallet-API Startup Wait
for i in range(15):  # 15 attempts, 1 second apart
    if check_wallet_api():
        return {"success": True}
    time.sleep(1)
```

### src/js/app.js - Frontend Application

**Purpose:** Main frontend controller (7000+ lines, monolithic).

**Key Sections:**

1. **Asset Configuration** (lines 1-200)
   - BEAM logo as inline SVG data URI
   - ASSET_ICONS mapping for known tokens
   - ASSET_CONFIG with decimals, colors

2. **API Calls** (lines 200-400)
   - `apiCall(method, params)` - Generic JSON-RPC wrapper
   - Debug logging system
   - Error handling with toast notifications

3. **Formatting Utilities** (lines 400-600)
   - `formatAmount(groth, decimals)` - Groth to display
   - `parseAmount(amount)` - Display to groth
   - `parseMetadata(metaStr)` - BEAM STD format parser

4. **UI Rendering** (lines 600-4000)
   - Dashboard with balance breakdown
   - Asset cards with icons
   - Transaction history
   - Address list with QR codes

5. **Welcome/Unlock Flow** (lines 4000-5500)
   - `showWelcomeScreen()` - Initial unlock UI
   - `welcomeUnlock()` - Handle unlock with password
   - `showCreateWallet()` - New wallet wizard
   - `showRestoreWallet()` - Restore from seed
   - Seed phrase display with grid layout

6. **Page Navigation** (lines 5500-7000)
   - `showDashboard()`, `showSendPage()`, etc.
   - Bottom navigation handling
   - Modal system for confirmations

### State Management (src/js/state.js)

```javascript
// Global state structure
state = {
  wallet: {
    isConnected: false,
    isLocked: true,
    name: null,
    assets: [],        // [{assetId, available, receiving, sending, ...}]
    utxos: [],
    transactions: [],
    addresses: []
  },
  dex: {
    pools: [],         // [{aid1, aid2, tok1, tok2, k1_2, k2_1, ...}]
    fromAsset: null,
    toAsset: null,
    quote: null
  },
  ui: {
    currentPage: 'dashboard',
    isLoading: false,
    debugVisible: false
  },
  settings: {
    nodeMode: 'public',  // 'public' or 'local'
    currentNode: 'eu-node01.mainnet.beam.mw:8100',
    hiddenAssets: []
  }
}

// Reactive updates
subscribe('wallet.assets', (newAssets) => renderAssetsList());
setState('wallet.assets', fetchedAssets);  // Triggers subscribers
```

## Key Constants

```javascript
// Asset IDs
ASSET_BEAM = 0
ASSET_FOMO = 174
ASSET_BEAMX = 7

// Amounts
GROTH_PER_BEAM = 100000000  // 1 BEAM = 100M groth
DEFAULT_FEE = 100000        // 0.001 BEAM
BEAM_DECIMALS = 8

// DEX
DEX_CONTRACT_ID = '729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf'

// Ports
WEB_SERVER_PORT = 9080      // serve.py HTTP
WALLET_API_PORT = 10000     // wallet-api JSON-RPC
LOCAL_NODE_PORT = 10005     // beam-node P2P

// Binaries
BEAM_VERSION = '7.5.13882'
```

## Common Workflows

### Create New Wallet
```
1. User clicks "Create New Wallet"
2. Frontend validates name (alphanumeric, hyphen, underscore)
3. Frontend validates password (min 6 chars, must match confirmation)
4. POST /api/wallet/create {wallet: name, password: pass}
5. serve.py runs: beam-wallet init --wallet_path=wallets/{name}/wallet.db --pass={pass}
6. Extracts 12-word seed phrase from stdout
7. Returns {success: true, seed_phrase: "word1 word2 ..."}
8. Frontend displays seed in 3x4 grid with warning
9. User clicks "I've Saved" → auto-unlocks wallet
```

### Restore Wallet
```
1. User clicks "Restore from Seed"
2. Enters wallet name, 12-word seed phrase, password
3. Frontend validates seed (12 words, all lowercase)
4. POST /api/wallet/restore {wallet, password, seed_phrase}
5. serve.py runs: beam-wallet restore --wallet_path=... --pass=... --seed_phrase="word1;word2;..."
6. Note: seed words are semicolon-separated for CLI
7. Returns {success: true}
8. Auto-unlocks wallet
9. Balance may show 0 until rescan (use Settings → Rescan)
```

### Unlock Wallet
```
1. User selects wallet from dropdown + enters password
2. POST /api/wallet/unlock {wallet, password, node}
3. serve.py launches wallet-api subprocess:
   binaries/macos/wallet-api \
     --wallet_path=wallets/{name}/wallet.db \
     --pass={password} \
     --node_addr={node} \
     --port=10000 \
     --use_http=1 \
     --enable_assets
4. Polls wallet-api until responds (15 attempts)
5. Returns {success: true, wallet: name}
6. Frontend loads wallet data via wallet_status API
```

### Send Transaction
```
1. User enters recipient address, amount, optional comment
2. Frontend validates address format, amount > 0, sufficient balance
3. POST /api/wallet (JSON-RPC proxy)
   {method: "tx_send", params: {address, value, fee: 100000, asset_id, comment}}
4. wallet-api creates and signs transaction
5. Returns {result: {txId: "..."}}
6. Frontend shows success toast with txId
```

### DEX Swap
```
1. User selects from/to assets
2. User enters amount
3. Frontend calls invoke_contract with pool_trade + bPredictOnly=1
   {method: "invoke_contract", params: {
     args: "action=pool_trade,cid={DEX_CID},aid1=0,aid2=174,kind=2,amount1=100000000,bPredictOnly=1",
     contract: [DEX_SHADER_BYTES]
   }}
4. Returns quote: {tok1: -100000000, tok2: 814438519}
5. User confirms swap
6. Second invoke_contract with bPredictOnly=0, createTx=true
7. Returns transaction data for signing
```

### Switch to Local Node
```
1. User clicks "Local Node" in Settings
2. Enters wallet password
3. POST /api/node/switch {mode: "local", password}
4. serve.py:
   a. Exports owner key from wallet
   b. Stops existing beam-node (if any)
   c. Starts beam-node with --owner_key={key} --fast_sync=1
   d. Waits for node initialization
   e. Restarts wallet-api with --node_addr=127.0.0.1:10005
5. Returns {success: true, mode: "local"}
6. Node syncs blockchain in background
```

## DEX Contract Calls

**Pool Actions:**

| Action | Purpose | Parameters |
|--------|---------|------------|
| `pools_view` | List all pools | `cid` |
| `pool_view` | View specific pool | `cid,aid1,aid2,kind` |
| `pool_trade` | Swap tokens | `cid,aid1,aid2,kind,amount1,bPredictOnly` |
| `pool_add_liquidity` | Add liquidity | `cid,aid1,aid2,kind,amount1,amount2` |
| `pool_withdraw` | Remove liquidity | `cid,aid1,aid2,kind,ctl` |

**Pool Data Structure:**
```javascript
{
  aid1: 0,              // Asset 1 (BEAM)
  aid2: 174,            // Asset 2 (FOMO)
  tok1: 8120504552105,  // Reserve of aid1 (groth)
  tok2: 66136536898747, // Reserve of aid2 (groth)
  "lp-token": 175,      // LP token asset ID (note: hyphenated!)
  ctl: 27125190867423,  // Total LP control value
  k1_2: "0.12278...",   // Price: 1 aid1 = X aid2
  k2_1: "8.14438...",   // Price: 1 aid2 = X aid1
  kind: 2               // Pool type (0=volatile, 1=stable, 2=standard)
}
```

## Testing

### Bash Tests (tests/test_launch.sh)

**Run:**
```bash
cd LightWallet
./tests/test_launch.sh
```

**Test Categories:**
1. Binary existence & executability
2. Wallet directory structure
3. API endpoint responses
4. DEX contract calls (may skip without local node)
5. File structure integrity

### Selenium Tests (Recommended Implementation)

For comprehensive UI testing with screenshots:

```python
# tests/test_selenium.py
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import os

class LightWalletTests:
    def __init__(self, headless=False):
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--window-size=1400,900')
        self.driver = webdriver.Chrome(options=options)
        self.base_url = "http://127.0.0.1:9080"
        self.screenshot_dir = "tests/screenshots"
        os.makedirs(self.screenshot_dir, exist_ok=True)

    def screenshot(self, name):
        """Save screenshot with timestamp"""
        path = f"{self.screenshot_dir}/{name}_{int(time.time())}.png"
        self.driver.save_screenshot(path)
        print(f"Screenshot saved: {path}")
        return path

    def wait_for(self, selector, timeout=10):
        """Wait for element to be visible"""
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )

    # ==================== TEST CASES ====================

    def test_welcome_screen(self):
        """Test welcome/unlock screen loads correctly"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Should see welcome screen
        self.screenshot("01_welcome_screen")

        # Check for key elements
        assert self.driver.find_element(By.CSS_SELECTOR, ".welcome-container")
        assert self.driver.find_element(By.CSS_SELECTOR, "#wallet-select")
        assert self.driver.find_element(By.CSS_SELECTOR, "#unlock-password")
        print("PASS: Welcome screen loaded")

    def test_create_wallet_flow(self):
        """Test wallet creation wizard"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Click "Create New Wallet"
        create_btn = self.driver.find_element(By.CSS_SELECTOR, ".create-wallet-btn")
        create_btn.click()
        time.sleep(1)
        self.screenshot("02_create_wallet_form")

        # Fill form
        name_input = self.driver.find_element(By.CSS_SELECTOR, "#new-wallet-name")
        name_input.send_keys("test_selenium_wallet")

        pass_input = self.driver.find_element(By.CSS_SELECTOR, "#new-wallet-password")
        pass_input.send_keys("TestPass123")

        confirm_input = self.driver.find_element(By.CSS_SELECTOR, "#new-wallet-confirm")
        confirm_input.send_keys("TestPass123")

        self.screenshot("03_create_wallet_filled")

        # Submit
        submit_btn = self.driver.find_element(By.CSS_SELECTOR, "#create-wallet-submit")
        submit_btn.click()
        time.sleep(3)

        # Should see seed phrase
        self.screenshot("04_seed_phrase_display")
        seed_grid = self.driver.find_element(By.CSS_SELECTOR, ".seed-grid")
        assert seed_grid, "Seed phrase grid not found"

        # Count seed words (should be 12)
        seed_words = self.driver.find_elements(By.CSS_SELECTOR, ".seed-word")
        assert len(seed_words) == 12, f"Expected 12 seed words, got {len(seed_words)}"
        print("PASS: Wallet creation flow")

    def test_unlock_wallet(self):
        """Test wallet unlock with password"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Select wallet from dropdown
        wallet_select = self.driver.find_element(By.CSS_SELECTOR, "#wallet-select")
        wallet_select.click()
        time.sleep(0.5)

        # Select first wallet option
        options = self.driver.find_elements(By.CSS_SELECTOR, "#wallet-select option")
        if len(options) > 1:
            options[1].click()

        # Enter password
        pass_input = self.driver.find_element(By.CSS_SELECTOR, "#unlock-password")
        pass_input.send_keys("TestPass123")

        self.screenshot("05_unlock_form_filled")

        # Click unlock
        unlock_btn = self.driver.find_element(By.CSS_SELECTOR, "#unlock-btn")
        unlock_btn.click()
        time.sleep(5)  # Wait for wallet-api to start

        self.screenshot("06_dashboard_after_unlock")

        # Should see dashboard
        dashboard = self.driver.find_element(By.CSS_SELECTOR, ".dashboard-container")
        assert dashboard, "Dashboard not found after unlock"
        print("PASS: Wallet unlock")

    def test_dashboard_elements(self):
        """Test dashboard UI elements"""
        # Assumes wallet is already unlocked
        self.screenshot("07_dashboard_full")

        # Check balance display
        balance = self.driver.find_element(By.CSS_SELECTOR, ".total-balance")
        assert balance, "Balance display not found"

        # Check asset list
        assets = self.driver.find_elements(By.CSS_SELECTOR, ".asset-card")
        print(f"Found {len(assets)} asset cards")

        # Check navigation
        nav_items = self.driver.find_elements(By.CSS_SELECTOR, ".nav-item")
        assert len(nav_items) >= 4, "Navigation items missing"

        print("PASS: Dashboard elements")

    def test_send_page(self):
        """Test send transaction page"""
        # Click send in navigation
        send_nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='send']")
        send_nav.click()
        time.sleep(1)

        self.screenshot("08_send_page")

        # Check form elements
        assert self.driver.find_element(By.CSS_SELECTOR, "#send-address")
        assert self.driver.find_element(By.CSS_SELECTOR, "#send-amount")
        assert self.driver.find_element(By.CSS_SELECTOR, "#send-submit")

        print("PASS: Send page elements")

    def test_receive_page(self):
        """Test receive/addresses page"""
        receive_nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='receive']")
        receive_nav.click()
        time.sleep(1)

        self.screenshot("09_receive_page")

        # Check for address display
        addresses = self.driver.find_elements(By.CSS_SELECTOR, ".address-card")
        print(f"Found {len(addresses)} addresses")

        # Check QR code
        qr_codes = self.driver.find_elements(By.CSS_SELECTOR, ".qr-code")
        assert len(qr_codes) > 0, "No QR codes found"

        print("PASS: Receive page")

    def test_dex_page(self):
        """Test DEX swap page"""
        dex_nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='dex']")
        dex_nav.click()
        time.sleep(2)

        self.screenshot("10_dex_page")

        # Check swap form
        assert self.driver.find_element(By.CSS_SELECTOR, ".swap-container")

        # Check token selectors
        token_selectors = self.driver.find_elements(By.CSS_SELECTOR, ".token-selector")
        assert len(token_selectors) >= 2, "Token selectors missing"

        print("PASS: DEX page")

    def test_settings_page(self):
        """Test settings page"""
        settings_nav = self.driver.find_element(By.CSS_SELECTOR, "[data-page='settings']")
        settings_nav.click()
        time.sleep(1)

        self.screenshot("11_settings_page")

        # Check node toggle
        node_toggle = self.driver.find_element(By.CSS_SELECTOR, ".node-mode-toggle")
        assert node_toggle, "Node toggle not found"

        # Check lock button
        lock_btn = self.driver.find_element(By.CSS_SELECTOR, "#lock-wallet-btn")
        assert lock_btn, "Lock button not found"

        print("PASS: Settings page")

    def test_invalid_password(self):
        """Test invalid password error handling"""
        self.driver.get(self.base_url)
        time.sleep(2)

        # Select wallet
        wallet_select = self.driver.find_element(By.CSS_SELECTOR, "#wallet-select")
        options = self.driver.find_elements(By.CSS_SELECTOR, "#wallet-select option")
        if len(options) > 1:
            options[1].click()

        # Enter wrong password
        pass_input = self.driver.find_element(By.CSS_SELECTOR, "#unlock-password")
        pass_input.send_keys("wrong_password_123")

        unlock_btn = self.driver.find_element(By.CSS_SELECTOR, "#unlock-btn")
        unlock_btn.click()
        time.sleep(3)

        self.screenshot("12_invalid_password_error")

        # Check for error message
        error = self.driver.find_element(By.CSS_SELECTOR, ".error-message")
        assert "password" in error.text.lower() or "invalid" in error.text.lower()

        print("PASS: Invalid password error")

    def run_all_tests(self):
        """Run all tests in sequence"""
        tests = [
            self.test_welcome_screen,
            self.test_create_wallet_flow,
            self.test_unlock_wallet,
            self.test_dashboard_elements,
            self.test_send_page,
            self.test_receive_page,
            self.test_dex_page,
            self.test_settings_page,
            self.test_invalid_password,
        ]

        results = []
        for test in tests:
            try:
                test()
                results.append((test.__name__, "PASS"))
            except Exception as e:
                self.screenshot(f"FAIL_{test.__name__}")
                results.append((test.__name__, f"FAIL: {e}"))

        print("\n" + "="*50)
        print("TEST RESULTS")
        print("="*50)
        for name, result in results:
            print(f"{name}: {result}")

        self.driver.quit()
        return results

# Run tests
if __name__ == "__main__":
    import sys
    headless = "--headless" in sys.argv
    tests = LightWalletTests(headless=headless)
    tests.run_all_tests()
```

**Run Selenium tests:**
```bash
# Install dependencies
pip install selenium webdriver-manager

# Start wallet server
python3 serve.py 9080 &

# Run tests (with browser visible)
python3 tests/test_selenium.py

# Run tests (headless)
python3 tests/test_selenium.py --headless
```

## Development Workflow

### Making Improvements

1. **Identify Issue**
   - Check console for JS errors
   - Check serve.py output for API errors
   - Look at screenshots from failed tests

2. **Locate Code**
   - UI issue → `src/js/app.js` or `src/js/pages/*.js`
   - API issue → `serve.py`
   - Styling issue → `src/css/*.css`
   - State issue → `src/js/state.js`

3. **Make Changes**
   - Edit relevant file
   - Test manually in browser
   - Run Selenium tests for full coverage

4. **Test Changes**
   ```bash
   # Start server
   python3 serve.py 9080

   # Run bash tests
   ./tests/test_launch.sh

   # Run Selenium tests
   python3 tests/test_selenium.py
   ```

5. **Commit & Push**
   ```bash
   git add -A
   git commit -m "Description of change"
   git push origin main
   ```

### Common Improvement Areas

| Area | Files | What to Look For |
|------|-------|------------------|
| Loading states | app.js | Missing spinners, stuck states |
| Error messages | app.js, serve.py | Generic errors, missing context |
| Mobile responsiveness | styles.css | Small screen layouts |
| Performance | state.js, api.js | Unnecessary API calls, slow renders |
| UX flows | pages/*.js | Confusing navigation, missing feedback |
| Security | serve.py | Password handling, input validation |

### Debug Tools

**Browser Console:**
```javascript
// Check current state
window.debugState && window.debugState()

// Force refresh wallet data
loadWalletData()

// Check API status
fetch('/api/status').then(r => r.json()).then(console.log)
```

**Server Logs:**
```bash
# Watch serve.py output
# Shows all API calls, errors, process management

# Check wallet-api log
tail -f logs/{wallet_name}_api.log

# Check node log (if local node running)
tail -f logs/beam-node.log
```

## CSS Theme

```css
/* Color palette (from variables.css) */
--bg-primary: #0a0e17;        /* Darkest background */
--bg-secondary: #111827;      /* Card backgrounds */
--bg-tertiary: #1e293b;       /* Hover states */
--accent-primary: #25c2a0;    /* BEAM green */
--accent-secondary: #00d4ff;  /* Cyan highlights */
--text-primary: #f8fafc;      /* Main text */
--text-secondary: #94a3b8;    /* Muted text */
--text-muted: #64748b;        /* Very muted */
--success: #10b981;           /* Success states */
--warning: #f59e0b;           /* Warning states */
--error: #ef4444;             /* Error states */
--info: #3b82f6;              /* Info states */

/* Fonts */
--font-primary: 'Outfit', sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

## Troubleshooting

### "Connection error" on unlock
- Check if serve.py is running
- Check if another wallet-api is running on port 10000
- Try: `pkill -f wallet-api && pkill -f serve.py`

### Balance shows 0 after restore
- Use Settings → Rescan to recover balances
- This requires starting local node with owner key

### DEX not working
- DEX requires local node with shader support
- Public nodes don't support contract calls
- Check if DEX shader loaded: look for "Loaded DEX shader" in serve.py output

### Wallet won't create
- Check wallet name (only alphanumeric, hyphen, underscore)
- Check password (minimum 6 characters)
- Check binaries exist: `ls binaries/macos/`

### Node sync stuck
- Check internet connection
- Try different public node in settings
- Check logs: `tail -f logs/beam-node.log`

## Version History

- **1.0.0** - Initial release
  - Full wallet functionality (create, restore, send, receive)
  - DEX integration
  - Local node support
  - macOS DMG distribution

## Links

- **BEAM Website:** https://beam.mw
- **BEAM GitHub:** https://github.com/BeamMW
- **BEAM Explorer:** https://explorer.beam.mw
- **This Wallet:** https://github.com/vsnation/Beam-Light-Wallet
