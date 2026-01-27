#!/usr/bin/env python3
"""
BEAM Light Wallet - Web Server with API Proxy and Wallet Management

Serves static files, proxies API requests to wallet-api, and manages wallet processes.
Supports wallet creation, unlock, lock, and switching.

Usage:
    python3 serve.py [port]
    Default port: 8080
"""

import sys
import os
import json
import signal
import subprocess
import time
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
WALLET_API_URL = "http://127.0.0.1:10000/api/wallet"
WALLET_API_PORT = 10000
BASE_DIR = Path(__file__).parent.absolute()
WALLETS_DIR = BASE_DIR / "wallets"
BINARIES_DIR = BASE_DIR / "binaries"
LOGS_DIR = BASE_DIR / "logs"
NODE_DATA_DIR = BASE_DIR / "node_data"

# Detect platform
import platform
PLATFORM = platform.system().lower()
if PLATFORM == "darwin":
    PLATFORM = "macos"

WALLET_CLI_BINARY = BINARIES_DIR / PLATFORM / "beam-wallet"
WALLET_API_BINARY = BINARIES_DIR / PLATFORM / "wallet-api"
BEAM_NODE_BINARY = BINARIES_DIR / PLATFORM / "beam-node"

# Default nodes
DEFAULT_NODE = "eu-node01.mainnet.beam.mw:8100"
LOCAL_NODE_ADDR = "127.0.0.1:10005"
LOCAL_NODE_PORT = 10005

# DEX contract ID
DEX_CONTRACT_ID = "729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf"

# Load DEX shader bytes for contract calls
DEX_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "amm_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            DEX_SHADER = list(f.read())
        print(f"Loaded DEX shader: {len(DEX_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load DEX shader: {e}")

# Track state
wallet_api_process = None
beam_beam_node_process = None
active_wallet = None
node_mode = "public"  # "public" or "local"

# Price cache (CoinGecko)
price_cache = {"beam_usd": 0, "last_update": 0}
PRICE_CACHE_TTL = 60  # Cache for 60 seconds

# Threading for background operations
import threading
server_instance = None

def shutdown_all():
    """Shutdown all processes gracefully"""
    global beam_beam_node_process, wallet_api_process
    print("[SHUTDOWN] Stopping all services...")

    # Stop wallet-api
    stop_wallet_api()

    # Stop beam-node
    if beam_beam_node_process:
        try:
            beam_beam_node_process.terminate()
            beam_beam_node_process.wait(timeout=5)
        except:
            try:
                beam_beam_node_process.kill()
            except:
                pass
        beam_beam_node_process = None

    # Also kill any orphaned processes
    try:
        subprocess.run(["pkill", "-f", "wallet-api.*--port=10000"], capture_output=True)
        subprocess.run(["pkill", "-f", "beam-node.*--port=10005"], capture_output=True)
    except:
        pass

    print("[SHUTDOWN] All services stopped")


def get_wallet_api_pid():
    """Get wallet-api PID if running"""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "wallet-api.*--port=10000"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return int(result.stdout.strip().split()[0])
    except:
        pass
    return None


def is_wallet_api_running():
    """Check if wallet-api is responding"""
    try:
        req = urllib.request.Request(
            WALLET_API_URL,
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "wallet_status"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=2) as response:
            return response.status == 200
    except:
        return False


def list_wallets():
    """List available wallet directories"""
    wallets = []
    if WALLETS_DIR.exists():
        for item in WALLETS_DIR.iterdir():
            if item.is_dir() and (item / "wallet.db").exists():
                wallets.append(item.name)
    return sorted(wallets)


def stop_wallet_api():
    """Stop running wallet-api process"""
    global wallet_api_process, active_wallet

    pid = get_wallet_api_pid()
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
            time.sleep(1)
            if get_wallet_api_pid():
                os.kill(pid, signal.SIGKILL)
        except:
            pass

    wallet_api_process = None
    active_wallet = None

    state_file = BASE_DIR / ".active_wallet"
    if state_file.exists():
        state_file.unlink()

    return True


def get_beam_node_pid():
    """Get beam-node PID if running"""
    try:
        result = subprocess.run(
            ["pgrep", "-f", f"beam-node.*--port={LOCAL_NODE_PORT}"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return int(result.stdout.strip().split()[0])
    except:
        pass
    return None


def is_node_running():
    """Check if local beam-node is running"""
    return get_beam_node_pid() is not None


def get_node_sync_status():
    """Get local node sync status from node API or by parsing logs"""
    if not is_node_running():
        return {"running": False, "synced": False, "height": 0, "progress": 0}

    try:
        # Read from node log file to get sync progress
        # Use tail to read last N lines efficiently
        log_file = LOGS_DIR / "beam-node.log"
        if log_file.exists():
            # Use subprocess to efficiently get relevant lines
            result = subprocess.run(
                ["grep", "-E", "My Tip:|Updating node:|Initial Tip:|fully synchronized", str(log_file)],
                capture_output=True, text=True, timeout=5
            )
            lines = result.stdout.strip().split('\n')[-50:]  # Last 50 matching lines

            current_height = 0
            target_height = 0
            progress = 0
            synced = False

            for line in reversed(lines):
                # Look for "Updating node: X% (current/total)" format
                match = re.search(r'Updating node:\s*(\d+)%\s*\((\d+)/(\d+)\)', line)
                if match:
                    progress = int(match.group(1))
                    # These are block counts, not heights
                    if progress == 100:
                        synced = True
                    break

                # Look for "My Tip" which shows current synced height
                if "My Tip:" in line:
                    match = re.search(r'My Tip:\s*(\d+)', line)
                    if match:
                        current_height = int(match.group(1))
                        # If we see My Tip, node is synced to at least this height
                        if current_height > 3000000:  # Reasonable mainnet height
                            synced = True
                            progress = 100

                # Look for "Initial Tip" which shows starting state
                if current_height == 0 and "Initial Tip:" in line:
                    match = re.search(r'Initial Tip:\s*(\d+)', line)
                    if match:
                        current_height = int(match.group(1))

                # Look for sync complete messages
                if "fully synchronized" in line.lower():
                    synced = True
                    progress = 100
                    break

            # If we found Updating node: 100%, consider it synced
            if progress >= 100:
                synced = True

            return {
                "running": True,
                "synced": synced,
                "height": current_height,
                "target": target_height,
                "progress": progress
            }
    except Exception as e:
        print(f"Error getting node status: {e}")

    return {"running": True, "synced": False, "height": 0, "progress": 0}


def stop_beam_node():
    """Stop running beam-node process"""
    global beam_beam_node_process, node_mode

    pid = get_beam_node_pid()
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
            time.sleep(2)
            if get_beam_node_pid():
                os.kill(pid, signal.SIGKILL)
            print(f"Stopped beam-node (PID: {pid})")
        except Exception as e:
            print(f"Error stopping node: {e}")

    beam_beam_node_process = None

    # Remove PID file
    pid_file = BASE_DIR / ".node.pid"
    if pid_file.exists():
        pid_file.unlink()

    return True


def start_beam_node(owner_key=None, password=None):
    """Start local beam-node with fast_sync"""
    global beam_beam_node_process, node_mode

    if not BEAM_NODE_BINARY.exists():
        return {"error": f"beam-node binary not found at {BEAM_NODE_BINARY}"}

    # Stop existing node first
    stop_beam_node()
    LOGS_DIR.mkdir(exist_ok=True)
    NODE_DATA_DIR.mkdir(exist_ok=True)

    log_file = LOGS_DIR / "beam-node.log"

    # Build command with fast_sync enabled
    cmd = [
        str(BEAM_NODE_BINARY),
        f"--port={LOCAL_NODE_PORT}",
        f"--log_level=info",
        "--fast_sync=1",  # Enable fast sync
        "--peer=eu-node01.mainnet.beam.mw:8100",
        "--peer=us-node01.mainnet.beam.mw:8100",
        "--peer=ap-node01.mainnet.beam.mw:8100"
    ]

    # Add owner key if provided (required for wallet to see balances)
    if owner_key:
        cmd.append(f"--owner_key={owner_key}")
        # Password is required when using owner key
        if password:
            cmd.append(f"--pass={password}")

    try:
        with open(log_file, "w") as lf:
            beam_beam_node_process = subprocess.Popen(
                cmd,
                stdout=lf,
                stderr=subprocess.STDOUT,
                cwd=str(NODE_DATA_DIR)  # Store node.db in node_data directory
            )

        # Wait a moment and check if started
        time.sleep(3)
        if is_node_running():
            node_mode = "local"
            (BASE_DIR / ".node.pid").write_text(str(beam_beam_node_process.pid))
            (BASE_DIR / ".node_mode").write_text("local")
            print(f"Started beam-node (PID: {beam_beam_node_process.pid})")
            return {"success": True, "pid": beam_beam_node_process.pid}
        else:
            # Check log for errors
            if log_file.exists():
                log_content = log_file.read_text()
                if "error" in log_content.lower():
                    return {"error": log_content[-500:]}
            return {"error": "Node failed to start"}

    except Exception as e:
        return {"error": str(e)}


def switch_to_local_node(password, wallet_name=None):
    """Switch wallet-api to use local node with owner key (seamless)

    Args:
        password: Wallet password
        wallet_name: Optional wallet name (uses active_wallet if not provided)
    """
    global node_mode

    # Use provided wallet_name or fall back to active_wallet
    target_wallet = wallet_name or active_wallet
    if not target_wallet:
        return {"error": "No wallet specified and no active wallet"}

    print(f"[switch_to_local_node] Switching wallet '{target_wallet}' to local node...")

    # Step 1: Export owner key (this stops wallet-api temporarily)
    owner_result = export_owner_key(target_wallet, password)
    if not owner_result.get("success"):
        print(f"[switch_to_local_node] Failed to export owner key: {owner_result}")
        return owner_result

    owner_key = owner_result.get("owner_key")
    print(f"[switch_to_local_node] Owner key exported successfully")

    # Step 2: Stop any existing node
    stop_beam_node()
    time.sleep(1)

    # Step 3: Start node with owner key
    print(f"[switch_to_local_node] Starting node with owner key...")
    node_result = start_beam_node(owner_key, password)
    if "error" in node_result:
        # Fallback: start without owner key
        print(f"[switch_to_local_node] Warning: Could not start with owner key: {node_result.get('error')}")
        node_result = start_beam_node()
        if "error" in node_result:
            return node_result

    # Step 4: Wait for node to initialize
    print(f"[switch_to_local_node] Waiting for node to initialize...")
    time.sleep(3)

    # Step 5: Start wallet-api with local node
    print(f"[switch_to_local_node] Starting wallet-api with local node...")
    result = start_wallet_api(target_wallet, password, LOCAL_NODE_ADDR)
    if result.get("success"):
        node_mode = "local"
        (BASE_DIR / ".node_mode").write_text("local")
        print(f"[switch_to_local_node] Successfully switched to local node!")
    else:
        print(f"[switch_to_local_node] Failed to start wallet-api: {result}")

    return result


def start_wallet_api(wallet_name, password, node_addr=None):
    """Start wallet-api for given wallet"""
    global wallet_api_process, active_wallet

    wallet_path = WALLETS_DIR / wallet_name / "wallet.db"
    if not wallet_path.exists():
        return {"error": f"Wallet '{wallet_name}' not found"}

    if not WALLET_API_BINARY.exists():
        return {"error": f"wallet-api binary not found at {WALLET_API_BINARY}"}

    stop_wallet_api()
    LOGS_DIR.mkdir(exist_ok=True)

    log_file = LOGS_DIR / f"{wallet_name}_api.log"
    node = node_addr or DEFAULT_NODE

    cmd = [
        str(WALLET_API_BINARY),
        f"--wallet_path={wallet_path}",
        f"--pass={password}",
        f"--node_addr={node}",
        f"--port={WALLET_API_PORT}",
        "--use_http=1",
        "--enable_assets",
        "--enable_lelantus"
    ]

    try:
        with open(log_file, "w") as lf:
            wallet_api_process = subprocess.Popen(
                cmd,
                stdout=lf,
                stderr=subprocess.STDOUT,
                cwd=str(BASE_DIR)
            )

        for _ in range(15):
            time.sleep(1)
            if is_wallet_api_running():
                active_wallet = wallet_name
                (BASE_DIR / ".active_wallet").write_text(wallet_name)
                return {"success": True, "wallet": wallet_name}

        if log_file.exists():
            log_content = log_file.read_text()
            if "File is not a database" in log_content or "invalid password" in log_content.lower():
                return {"error": "Invalid password"}
            if "EXCEPTION" in log_content:
                return {"error": log_content.split("EXCEPTION:")[-1].strip()[:100]}

        return {"error": "Wallet API failed to start (timeout)"}

    except Exception as e:
        return {"error": str(e)}


def create_wallet(wallet_name, password):
    """Create a new wallet using beam-wallet CLI"""
    if not WALLET_CLI_BINARY.exists():
        return {"error": f"beam-wallet binary not found at {WALLET_CLI_BINARY}"}

    # Create wallet directory
    wallet_dir = WALLETS_DIR / wallet_name
    if wallet_dir.exists():
        return {"error": f"Wallet '{wallet_name}' already exists"}

    wallet_dir.mkdir(parents=True, exist_ok=True)
    wallet_path = wallet_dir / "wallet.db"

    cmd = [
        str(WALLET_CLI_BINARY),
        "init",
        f"--wallet_path={wallet_path}",
        f"--pass={password}"
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        output = result.stdout + result.stderr

        # Extract seed phrase from output
        # The output contains: "Generated seed phrase: word1 word2 word3..."
        # or "Your seed phrase is: word1 word2..."
        seed_match = re.search(r'(?:Generated seed phrase|Your seed phrase is|seed phrase)[:\s]+([a-z\s;]+)', output, re.IGNORECASE)
        seed_phrase = None
        if seed_match:
            # Extract words (may be separated by spaces or semicolons)
            words_str = seed_match.group(1).strip()
            words = re.findall(r'[a-z]+', words_str.lower())
            if len(words) >= 12:
                seed_phrase = ' '.join(words[:12])

        if not wallet_path.exists():
            # Clean up on failure
            if wallet_dir.exists():
                import shutil
                shutil.rmtree(wallet_dir)
            return {"error": f"Wallet creation failed: {output[:200]}"}

        return {
            "success": True,
            "wallet": wallet_name,
            "seed_phrase": seed_phrase,
            "message": "Wallet created successfully. Save your seed phrase!"
        }

    except subprocess.TimeoutExpired:
        return {"error": "Wallet creation timed out"}
    except Exception as e:
        return {"error": str(e)}


def restore_wallet(wallet_name, password, seed_phrase):
    """Restore a wallet from seed phrase"""
    if not WALLET_CLI_BINARY.exists():
        return {"error": f"beam-wallet binary not found at {WALLET_CLI_BINARY}"}

    wallet_dir = WALLETS_DIR / wallet_name
    if wallet_dir.exists():
        return {"error": f"Wallet '{wallet_name}' already exists"}

    wallet_dir.mkdir(parents=True, exist_ok=True)
    wallet_path = wallet_dir / "wallet.db"

    # Format seed phrase with semicolons
    words = seed_phrase.strip().split()
    formatted_seed = ';'.join(words) + ';'

    cmd = [
        str(WALLET_CLI_BINARY),
        "restore",
        f"--wallet_path={wallet_path}",
        f"--pass={password}",
        f"--seed_phrase={formatted_seed}"
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        if not wallet_path.exists():
            if wallet_dir.exists():
                import shutil
                shutil.rmtree(wallet_dir)
            output = result.stdout + result.stderr
            return {"error": f"Wallet restore failed: {output[:200]}"}

        return {
            "success": True,
            "wallet": wallet_name,
            "message": "Wallet restored successfully"
        }

    except subprocess.TimeoutExpired:
        return {"error": "Wallet restore timed out"}
    except Exception as e:
        return {"error": str(e)}


def export_owner_key(wallet_name, password):
    """Export owner key for local node"""
    global wallet_api_process, active_wallet

    if not WALLET_CLI_BINARY.exists():
        return {"error": f"beam-wallet binary not found"}

    wallet_path = WALLETS_DIR / wallet_name / "wallet.db"
    if not wallet_path.exists():
        return {"error": f"Wallet '{wallet_name}' not found"}

    # Stop wallet-api to release database lock
    was_running = wallet_api_process is not None
    if was_running:
        stop_wallet_api()
        time.sleep(1)

    cmd = [
        str(WALLET_CLI_BINARY),
        "export_owner_key",
        f"--wallet_path={wallet_path}",
        f"--pass={password}"
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        output = result.stdout + result.stderr

        # Extract owner key from output
        key_match = re.search(r'Owner Viewer key[:\s]+(\S+)', output, re.IGNORECASE)
        if not key_match:
            key_match = re.search(r'owner_key[:\s]+(\S+)', output, re.IGNORECASE)
        if not key_match:
            # Try to find any hex string that looks like a key
            key_match = re.search(r'([a-fA-F0-9]{64,})', output)

        # Restart wallet-api if it was running
        if was_running:
            start_wallet_api(wallet_name, password)

        if key_match:
            return {"success": True, "owner_key": key_match.group(1)}

        if "invalid password" in output.lower() or "file is not a database" in output.lower():
            return {"error": "Invalid password"}

        return {"error": f"Could not extract owner key: {output[:500]}"}

    except Exception as e:
        # Try to restart wallet-api even on error
        if was_running:
            start_wallet_api(wallet_name, password)
        return {"error": str(e)}


def delete_wallet(wallet_name):
    """Delete a wallet directory"""
    wallet_dir = WALLETS_DIR / wallet_name
    if not wallet_dir.exists():
        return {"error": f"Wallet '{wallet_name}' not found"}

    # Don't delete active wallet
    if active_wallet == wallet_name:
        return {"error": "Cannot delete active wallet. Lock it first."}

    try:
        import shutil
        shutil.rmtree(wallet_dir)
        return {"success": True, "message": f"Wallet '{wallet_name}' deleted"}
    except Exception as e:
        return {"error": str(e)}


def rescan_wallet(wallet_name, password):
    """Trigger wallet rescan by connecting to local node with owner key.

    This is required after restoring a wallet to recover balances.
    The rescan happens automatically when wallet-api connects to a node
    that has the owner key configured.
    """
    global wallet_api_process, active_wallet, beam_beam_node_process

    # Step 1: Export owner key
    print(f"[rescan] Exporting owner key for {wallet_name}...")
    key_result = export_owner_key(wallet_name, password)
    if "error" in key_result:
        return {"error": f"Failed to export owner key: {key_result['error']}"}

    owner_key = key_result.get("owner_key")
    if not owner_key:
        return {"error": "Owner key not found in export result"}

    # Step 2: Restart local node with owner key
    print(f"[rescan] Restarting local node with owner key...")

    # Stop existing node
    if beam_beam_node_process:
        try:
            beam_beam_node_process.terminate()
            beam_beam_node_process.wait(timeout=5)
        except:
            beam_beam_node_process.kill()

    # Also kill any orphaned node processes
    try:
        subprocess.run(["pkill", "-f", "beam-node"], capture_output=True)
        time.sleep(1)
    except:
        pass

    # Start node with owner key
    node_binary = BASE_DIR / "binaries" / PLATFORM / "beam-node"
    if not node_binary.exists():
        # Fall back to public node - rescan won't work fully
        print(f"[rescan] Warning: beam-node not found, using public node")
        return start_wallet_api(wallet_name, password, LOCAL_NODE_ADDR)

    node_log = LOGS_DIR / "node_rescan.log"
    node_cmd = [
        str(node_binary),
        "--port=10005",
        "--log_level=info",
        "--fast_sync=1",
        "--peer=eu-node01.mainnet.beam.mw:8100",
        "--peer=us-node01.mainnet.beam.mw:8100",
        f"--owner_key={owner_key}"
    ]

    try:
        NODE_DATA_DIR.mkdir(exist_ok=True)
        with open(node_log, "w") as lf:
            beam_beam_node_process = subprocess.Popen(
                node_cmd,
                stdout=lf,
                stderr=subprocess.STDOUT,
                cwd=str(NODE_DATA_DIR)  # Store node.db in node_data directory
            )

        # Wait for node to start
        time.sleep(3)

        # Check if node started
        if beam_beam_node_process.poll() is not None:
            log_content = node_log.read_text() if node_log.exists() else ""
            print(f"[rescan] Node failed to start: {log_content[:200]}")
            # Fall back to local node without owner key
            return start_wallet_api(wallet_name, password, LOCAL_NODE_ADDR)

        print(f"[rescan] Node started with owner key, PID: {beam_beam_node_process.pid}")

    except Exception as e:
        print(f"[rescan] Failed to start node: {e}")
        return start_wallet_api(wallet_name, password, LOCAL_NODE_ADDR)

    # Step 3: Connect wallet-api to local node
    print(f"[rescan] Starting wallet-api with local node...")
    result = start_wallet_api(wallet_name, password, LOCAL_NODE_ADDR)

    if result.get("success"):
        result["message"] = "Wallet connected to local node. Rescan in progress..."
        result["rescan"] = True

    return result


class WalletProxyHandler(SimpleHTTPRequestHandler):
    """HTTP handler for static files, API proxy, and wallet management"""

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_GET(self):
        if self.path == "/api/status":
            self.handle_status()
        elif self.path == "/api/wallets":
            self.handle_list_wallets()
        elif self.path == "/api/heartbeat":
            self.handle_heartbeat()
        elif self.path == "/api/node/status":
            self.handle_node_status()
        elif self.path == "/api/price":
            self.handle_price()
        elif self.path.startswith("/css/") or self.path.startswith("/js/"):
            # Redirect CSS/JS requests to src/ directory
            self.path = "/src" + self.path
            super().do_GET()
        elif self.path.startswith("/src/"):
            # Serve src files directly
            super().do_GET()
        elif self.path.startswith("/config/"):
            # Serve config files
            super().do_GET()
        elif self.path.startswith("/explorer") or self.path in ["/", "/dashboard", "/assets", "/transactions", "/addresses", "/dex", "/settings", "/donate"]:
            # Handle all frontend routes - serve index.html with route info
            self.serve_with_route()
        elif self.path == "/index.html":
            # Serve modular version from src/
            self.path = "/src/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def serve_with_route(self):
        """Serve index.html with route info injected for frontend routing"""
        # Parse the path to determine page and sub-route
        path = self.path.split("?")[0]  # Remove query string
        route_parts = path.split("/")
        # Examples:
        # / -> ['', '']
        # /dashboard -> ['', 'dashboard']
        # /explorer -> ['', 'explorer']
        # /explorer/block/123 -> ['', 'explorer', 'block', '123']

        app_route = {
            "page": "dashboard",  # Default page
            "subType": None,
            "subId": None
        }

        # Map path to page
        if len(route_parts) >= 2:
            page = route_parts[1] if route_parts[1] else "dashboard"

            # Map routes to page IDs
            page_map = {
                "": "dashboard",
                "dashboard": "dashboard",
                "assets": "assets",
                "transactions": "transactions",
                "addresses": "addresses",
                "dex": "dex",
                "explorer": "explorer",
                "settings": "settings",
                "donate": "donate"
            }

            app_route["page"] = page_map.get(page, "dashboard")

            # Handle sub-routes for explorer
            if page == "explorer" and len(route_parts) >= 3:
                app_route["subType"] = route_parts[2] if len(route_parts) > 2 else None
                app_route["subId"] = route_parts[3] if len(route_parts) > 3 else None

        # Read index.html
        index_path = BASE_DIR / "src" / "index.html"
        if not index_path.exists():
            self.send_error(404, "index.html not found")
            return

        with open(index_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # Inject the route info as a JavaScript variable
        route_script = f"""<script>
window.APP_ROUTE = {json.dumps(app_route)};
</script>
"""
        # Insert before </head>
        html_content = html_content.replace("</head>", route_script + "</head>")

        # Send the modified HTML
        encoded_content = html_content.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(encoded_content))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(encoded_content)

    def do_POST(self):
        if self.path == "/api/wallet/unlock":
            self.handle_unlock()
        elif self.path == "/api/wallet/lock":
            self.handle_lock()
        elif self.path == "/api/wallet/create":
            self.handle_create()
        elif self.path == "/api/wallet/restore":
            self.handle_restore()
        elif self.path == "/api/wallet/rescan":
            self.handle_rescan()
        elif self.path == "/api/wallet/export_owner_key":
            self.handle_export_owner_key()
        elif self.path == "/api/node/start":
            self.handle_node_start()
        elif self.path == "/api/node/stop":
            self.handle_node_stop()
        elif self.path == "/api/node/switch":
            self.handle_node_switch()
        elif self.path == "/api/shutdown":
            self.handle_shutdown()
        elif self.path == "/api/update":
            self.handle_update()
        elif self.path.startswith("/api/wallet"):
            self.proxy_to_wallet_api()
        else:
            self.send_error(404, "Not Found")

    def do_DELETE(self):
        if self.path.startswith("/api/wallet/"):
            wallet_name = self.path.split("/")[-1]
            result = delete_wallet(wallet_name)
            self.send_json(result, 200 if "success" in result else 400)
        else:
            self.send_error(404, "Not Found")

    def get_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            return json.loads(self.rfile.read(content_length))
        return {}

    def handle_status(self):
        running = is_wallet_api_running()
        wallet = None

        state_file = BASE_DIR / ".active_wallet"
        if state_file.exists():
            wallet = state_file.read_text().strip()

        # Get node info
        node_status = get_node_sync_status()

        # Detect installation type
        install_type = "unknown"
        git_dir = BASE_DIR / ".git"
        if git_dir.exists():
            install_type = "git"
        elif "/Applications/" in str(BASE_DIR) or ".app/Contents" in str(BASE_DIR):
            install_type = "dmg"
        elif (BASE_DIR / "install.sh").exists():
            install_type = "git"  # install.sh script method

        self.send_json({
            "status": "ok",
            "port": PORT,
            "wallet_api_running": running,
            "active_wallet": wallet if running else None,
            "wallets_available": list_wallets(),
            "node_mode": node_mode,
            "node_running": node_status.get("running", False),
            "node_synced": node_status.get("synced", False),
            "node_progress": node_status.get("progress", 0),
            "node_height": node_status.get("height", 0),
            "install_type": install_type,
            "version": "1.0.2"
        })

    def handle_heartbeat(self):
        """Handle heartbeat from browser - kept for compatibility"""
        self.send_json({"status": "ok", "timestamp": time.time()})

    def handle_shutdown(self):
        """Handle shutdown request from browser (on page close)"""
        self.send_json({"status": "shutting_down"})
        # Shutdown in a separate thread to allow response to be sent
        def delayed_shutdown():
            time.sleep(0.5)
            print("\n[SHUTDOWN] Browser requested shutdown")
            shutdown_all()
            os._exit(0)
        threading.Thread(target=delayed_shutdown, daemon=True).start()

    def handle_node_status(self):
        """Get detailed node sync status"""
        status = get_node_sync_status()
        self.send_json(status)

    def handle_price(self):
        """Get BEAM price from CoinGecko (cached for 60 seconds)"""
        global price_cache
        current_time = time.time()

        # Return cached price if still valid
        if current_time - price_cache["last_update"] < PRICE_CACHE_TTL:
            self.send_json({
                "beam_usd": price_cache["beam_usd"],
                "cached": True,
                "cache_age": int(current_time - price_cache["last_update"])
            })
            return

        # Fetch fresh price from CoinGecko
        try:
            url = "https://api.coingecko.com/api/v3/simple/price?ids=beam&vs_currencies=usd"
            req = urllib.request.Request(url, headers={"User-Agent": "BEAM-LightWallet/1.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
                beam_usd = data.get("beam", {}).get("usd", 0)

                # Update cache
                price_cache["beam_usd"] = beam_usd
                price_cache["last_update"] = current_time

                self.send_json({
                    "beam_usd": beam_usd,
                    "cached": False
                })
        except Exception as e:
            # Return cached value on error, or 0 if no cache
            self.send_json({
                "beam_usd": price_cache["beam_usd"],
                "cached": True,
                "error": str(e)
            })

    def handle_node_start(self):
        """Start local beam-node"""
        try:
            body = self.get_json_body()
            owner_key = body.get("owner_key")
            password = body.get("password")
            result = start_beam_node(owner_key, password)
            self.send_json(result, 200 if "success" in result else 400)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_node_stop(self):
        """Stop local beam-node"""
        try:
            stop_beam_node()
            self.send_json({"success": True})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_node_switch(self):
        """Switch between public and local node"""
        try:
            body = self.get_json_body()
            mode = body.get("mode", "public")
            password = body.get("password")
            wallet_name = body.get("wallet")  # Optional wallet name for initial switch
            node_addr = body.get("node")  # Optional specific node address

            if not password:
                self.send_json({"error": "Password required to switch node"}, 400)
                return

            if mode == "local":
                result = switch_to_local_node(password, wallet_name)
            else:
                # Switch to public node (use specific address or default)
                global node_mode
                target_wallet = wallet_name or active_wallet
                if target_wallet:
                    target_node = node_addr if node_addr and not node_addr.startswith("127.") else DEFAULT_NODE
                    result = start_wallet_api(target_wallet, password, target_node)
                    if result.get("success"):
                        node_mode = "public"
                        (BASE_DIR / ".node_mode").write_text("public")
                        result["node"] = target_node
                else:
                    result = {"error": "No wallet specified and no active wallet"}

            self.send_json(result, 200 if result.get("success") else 400)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_list_wallets(self):
        self.send_json({
            "wallets": list_wallets(),
            "active": active_wallet
        })

    def handle_unlock(self):
        try:
            body = self.get_json_body()
            wallet_name = body.get("wallet")
            password = body.get("password")
            node_addr = body.get("node")

            if not wallet_name:
                self.send_json({"error": "Missing wallet name"}, 400)
                return
            if not password:
                self.send_json({"error": "Missing password"}, 400)
                return

            result = start_wallet_api(wallet_name, password, node_addr)
            status = 401 if "password" in result.get("error", "").lower() else (200 if "success" in result else 500)
            self.send_json(result, status)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_lock(self):
        stop_wallet_api()
        self.send_json({"success": True, "message": "Wallet locked"})

    def handle_create(self):
        try:
            body = self.get_json_body()
            wallet_name = body.get("wallet")
            password = body.get("password")

            if not wallet_name:
                self.send_json({"error": "Missing wallet name"}, 400)
                return
            if not password:
                self.send_json({"error": "Missing password"}, 400)
                return

            # Validate wallet name
            if not re.match(r'^[a-zA-Z0-9_-]+$', wallet_name):
                self.send_json({"error": "Invalid wallet name. Use only letters, numbers, underscore, hyphen."}, 400)
                return

            result = create_wallet(wallet_name, password)
            self.send_json(result, 200 if "success" in result else 400)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_restore(self):
        try:
            body = self.get_json_body()
            wallet_name = body.get("wallet")
            password = body.get("password")
            seed_phrase = body.get("seed_phrase")

            if not wallet_name:
                self.send_json({"error": "Missing wallet name"}, 400)
                return
            if not password:
                self.send_json({"error": "Missing password"}, 400)
                return
            if not seed_phrase:
                self.send_json({"error": "Missing seed phrase"}, 400)
                return

            # Validate wallet name
            if not re.match(r'^[a-zA-Z0-9_-]+$', wallet_name):
                self.send_json({"error": "Invalid wallet name"}, 400)
                return

            # Validate seed phrase (12 words)
            words = seed_phrase.strip().split()
            if len(words) != 12:
                self.send_json({"error": "Seed phrase must be exactly 12 words"}, 400)
                return

            result = restore_wallet(wallet_name, password, seed_phrase)

            if result.get("success"):
                # Don't trigger rescan synchronously - it takes too long
                # The unlock step will start wallet-api, and user can trigger rescan later
                result["message"] = "Wallet restored successfully. Use Settings > Rescan if balances appear incorrect."
                print(f"[restore] Wallet restored: {wallet_name}")

            self.send_json(result, 200 if "success" in result else 400)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_rescan(self):
        """Trigger wallet rescan to restore balances"""
        try:
            body = self.get_json_body()
            wallet_name = body.get("wallet") or active_wallet
            password = body.get("password")

            if not wallet_name:
                self.send_json({"error": "Missing wallet name"}, 400)
                return
            if not password:
                self.send_json({"error": "Missing password"}, 400)
                return

            result = rescan_wallet(wallet_name, password)
            self.send_json(result, 200 if "success" in result else 400)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_update(self):
        """Perform automatic update via git pull and restart server"""
        try:
            # Check if this is a git installation
            git_dir = BASE_DIR / ".git"
            if not git_dir.exists():
                self.send_json({"error": "Not a git installation. Please download update manually."}, 400)
                return

            print("\n[UPDATE] Starting automatic update...")

            # Run git pull
            import subprocess
            result = subprocess.run(
                ["git", "pull", "origin", "main"],
                cwd=str(BASE_DIR),
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Git pull failed"
                print(f"[UPDATE] Git pull failed: {error_msg}")
                self.send_json({"error": f"Git pull failed: {error_msg}"}, 500)
                return

            print(f"[UPDATE] Git pull output: {result.stdout}")

            # Check if there were actual updates
            if "Already up to date" in result.stdout:
                self.send_json({"success": True, "message": "Already up to date", "updated": False})
                return

            # Send success response before restarting
            self.send_json({"success": True, "message": "Update downloaded. Restarting...", "updated": True})

            # Schedule server restart
            def restart_server():
                time.sleep(1)  # Give time for response to be sent
                print("[UPDATE] Restarting server...")

                # Stop wallet-api and node gracefully
                shutdown_all()

                # Restart the server using exec to replace current process
                import sys
                python = sys.executable
                os.execl(python, python, *sys.argv)

            threading.Thread(target=restart_server, daemon=True).start()

        except subprocess.TimeoutExpired:
            self.send_json({"error": "Git pull timed out"}, 500)
        except Exception as e:
            print(f"[UPDATE] Error: {e}")
            self.send_json({"error": str(e)}, 500)

    def handle_export_owner_key(self):
        try:
            body = self.get_json_body()
            wallet_name = body.get("wallet")
            password = body.get("password")

            if not wallet_name:
                self.send_json({"error": "Missing wallet name"}, 400)
                return
            if not password:
                self.send_json({"error": "Missing password"}, 400)
                return

            result = export_owner_key(wallet_name, password)
            self.send_json(result, 200 if "success" in result else 400)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def proxy_to_wallet_api(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b""

            # Inject DEX shader for invoke_contract calls
            if body and DEX_SHADER:
                try:
                    data = json.loads(body)
                    if (data.get("method") == "invoke_contract" and
                        data.get("params", {}).get("args", "").find(DEX_CONTRACT_ID) >= 0 and
                        "contract" not in data.get("params", {})):
                        data["params"]["contract"] = DEX_SHADER
                        body = json.dumps(data).encode()
                except json.JSONDecodeError:
                    pass

            req = urllib.request.Request(
                WALLET_API_URL,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=30) as response:
                result = response.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(result)

        except urllib.error.URLError as e:
            self.send_json({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32000, "message": "Wallet is locked or not available"}
            }, 502)

        except Exception as e:
            self.send_json({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": str(e)}
            }, 500)

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def end_headers(self):
        if not hasattr(self, '_cors_sent'):
            self.send_cors_headers()
        super().end_headers()

    def log_message(self, format, *args):
        try:
            msg = str(args[0]) if args else ""
            parts = msg.split()
            path = parts[1] if len(parts) > 1 else ""
            if "/api/" in path:
                print(f"[API] {msg}")
            elif path.endswith((".html", ".js", ".css")):
                print(f"[STATIC] {msg}")
        except Exception:
            pass  # Silently ignore logging errors


def main():
    os.chdir(str(BASE_DIR))

    WALLETS_DIR.mkdir(exist_ok=True)
    LOGS_DIR.mkdir(exist_ok=True)

    running = is_wallet_api_running()
    state_file = BASE_DIR / ".active_wallet"
    wallet_name = state_file.read_text().strip() if state_file.exists() else "none"

    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║             BEAM Light Wallet - Web Server                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Web UI:      http://127.0.0.1:{PORT}/                              ║
║  API Proxy:   http://127.0.0.1:{PORT}/api/wallet                    ║
╠══════════════════════════════════════════════════════════════════╣
║  Wallet API:  {"RUNNING" if running else "STOPPED":<10}                                    ║
║  Active:      {wallet_name:<15}                                ║
║  Wallets:     {', '.join(list_wallets()) or 'none':<30}      ║
╠══════════════════════════════════════════════════════════════════╣
║  Management Endpoints:                                           ║
║    GET  /api/status              - Server & wallet status        ║
║    GET  /api/wallets             - List available wallets        ║
║    POST /api/wallet/create       - Create new wallet             ║
║    POST /api/wallet/restore      - Restore from seed + rescan    ║
║    POST /api/wallet/rescan       - Rescan wallet for balances    ║
║    POST /api/wallet/unlock       - Unlock wallet                 ║
║    POST /api/wallet/lock         - Lock wallet                   ║
║    POST /api/wallet/export_owner_key - Export owner key          ║
║    DELETE /api/wallet/{{name}}     - Delete wallet                 ║
║    POST /api/wallet              - Proxy to wallet-api           ║
╚══════════════════════════════════════════════════════════════════╝
""")

    server = HTTPServer(("127.0.0.1", PORT), WalletProxyHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        shutdown_all()
        server.server_close()
        print("Server stopped.")


if __name__ == "__main__":
    main()
