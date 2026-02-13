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

# All private data (binaries, wallets, logs, node_data) stored in ~/.beam-light-wallet
# This keeps user data in a consistent location regardless of how the app was installed
DATA_DIR = Path.home() / ".beam-light-wallet"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Migrate from old locations if they exist
_old_app_support = Path.home() / "Library" / "Application Support" / "BEAM Light Wallet"
_old_home_dir = Path.home() / "BEAM-LightWallet"
for _old_dir in [_old_app_support, _old_home_dir]:
    if _old_dir.exists() and _old_dir != DATA_DIR:
        for _subdir in ["wallets", "binaries", "logs", "node_data"]:
            _old_sub = _old_dir / _subdir
            _new_sub = DATA_DIR / _subdir
            if _old_sub.exists() and not _old_sub.is_symlink() and not _new_sub.exists():
                import shutil
                print(f"Migrating {_old_sub} -> {_new_sub}")
                shutil.copytree(str(_old_sub), str(_new_sub))

WALLETS_DIR = DATA_DIR / "wallets"
BINARIES_DIR = DATA_DIR / "binaries"
LOGS_DIR = DATA_DIR / "logs"
NODE_DATA_DIR = DATA_DIR / "node_data"

# Detect platform
import platform
PLATFORM = platform.system().lower()
if PLATFORM == "darwin":
    PLATFORM = "macos"

# Add .exe extension for Windows
EXE_EXT = ".exe" if PLATFORM == "windows" else ""
WALLET_CLI_BINARY = BINARIES_DIR / PLATFORM / f"beam-wallet{EXE_EXT}"
WALLET_API_BINARY = BINARIES_DIR / PLATFORM / f"wallet-api{EXE_EXT}"
BEAM_NODE_BINARY = BINARIES_DIR / PLATFORM / f"beam-node{EXE_EXT}"

# Default nodes
DEFAULT_NODE = "eu-node01.mainnet.beam.mw:8100"
LOCAL_NODE_ADDR = "127.0.0.1:10005"
LOCAL_NODE_PORT = 10005

# Contract IDs
DEX_CONTRACT_ID = "729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf"
MINTER_CONTRACT_ID = "295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868"
BLACKHOLE_CONTRACT_ID = "5ab408982b148210e88f180114f10222a2235eafeede0a3a224fda0e523e17b7"
# P2P Escrow Contract V7 - Deployed 2026-01-30
# Features: SetZero fix for cancel_order, confirm_payment & claim_trade require rating (1-5)
P2P_ESCROW_CONTRACT_ID = "2145205e91c3c0a68b0f439b8afd7a0b4729fb232768dfdf5ab421da864d76f7"

# Airdrop Contract - Voucher-based token distribution
# Set after deployment (placeholder until deployed)
AIRDROP_CONTRACT_ID = "8737e0d39575d7015fdea259fa091e41fc293e6c3d54e80d529033c349b5b18e"

# Fuddle Contract - On-chain Wordle game
# Set after deployment (placeholder until deployed)
FUDDLE_CONTRACT_ID = "28c52aef751ebe40d611660414dc355db7de4ae76bcc1dab5952537010735808"

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

# Load Minter shader bytes for contract calls
MINTER_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "minter_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            MINTER_SHADER = list(f.read())
        print(f"Loaded Minter shader: {len(MINTER_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load Minter shader: {e}")

# Load BlackHole shader bytes for burn functionality
BLACKHOLE_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "blackhole_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            BLACKHOLE_SHADER = list(f.read())
        print(f"Loaded BlackHole shader: {len(BLACKHOLE_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load BlackHole shader: {e}")

# Load P2P Escrow shader bytes for P2P marketplace contract calls
P2P_ESCROW_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "p2p_escrow_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            P2P_ESCROW_SHADER = list(f.read())
        print(f"Loaded P2P Escrow shader: {len(P2P_ESCROW_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load P2P Escrow shader: {e}")

# Load Airdrop shader bytes for voucher airdrop contract calls
AIRDROP_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "airdrop_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            AIRDROP_SHADER = list(f.read())
        print(f"Loaded Airdrop shader: {len(AIRDROP_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load Airdrop shader: {e}")

# Load Fuddle shader bytes for on-chain Wordle game
FUDDLE_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "fuddle_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            FUDDLE_SHADER = list(f.read())
        print(f"Loaded Fuddle shader: {len(FUDDLE_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load Fuddle shader: {e}")

# Track state
wallet_api_process = None
beam_beam_node_process = None
active_wallet = None

# Server-side password storage (in-memory only, never persisted to disk)
active_password = None
active_owner_key = None

# State files directory (writable data dir)
STATE_DIR = DATA_DIR

# Load saved node_mode or default to "public"
node_mode_file = STATE_DIR / ".node_mode"
if node_mode_file.exists():
    try:
        node_mode = node_mode_file.read_text().strip()
        if node_mode not in ("public", "local"):
            node_mode = "public"
    except:
        node_mode = "public"
else:
    node_mode = "public"

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


def kill_process_on_port(port):
    """Kill any process LISTENING on the specified port (not outgoing connections)"""
    try:
        # Use lsof with -sTCP:LISTEN to only find processes listening on the port
        # This prevents killing beam-node which has outgoing connections to peers on port 10000
        result = subprocess.run(
            ["lsof", "-ti", f"TCP:{port}", "-sTCP:LISTEN"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                try:
                    pid = int(pid.strip())
                    os.kill(pid, signal.SIGTERM)
                    print(f"Killed process {pid} on port {port}")
                    time.sleep(1)
                    # Force kill if still running
                    try:
                        os.kill(pid, 0)  # Check if still alive
                        os.kill(pid, signal.SIGKILL)
                        print(f"Force killed process {pid}")
                    except ProcessLookupError:
                        pass  # Process already dead
                except (ValueError, ProcessLookupError):
                    pass
            return True
    except Exception as e:
        print(f"Error killing process on port {port}: {e}")
    return False


def stop_wallet_api():
    """Stop running wallet-api process"""
    global wallet_api_process, active_wallet

    pid = get_wallet_api_pid()
    if pid:
        try:
            os.kill(pid, signal.SIGKILL)
            time.sleep(0.2)
        except ProcessLookupError:
            pass
        except Exception as e:
            print(f"Error killing wallet-api: {e}")

    wallet_api_process = None
    active_wallet = None

    # Also kill any process using the wallet API port
    kill_process_on_port(WALLET_API_PORT)

    state_file = STATE_DIR / ".active_wallet"
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
                    current_height = int(match.group(2))
                    target_height = int(match.group(3))
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

    # Also kill any process using the node port
    kill_process_on_port(LOCAL_NODE_PORT)

    # Remove PID file
    pid_file = STATE_DIR / ".node.pid"
    if pid_file.exists():
        pid_file.unlink()

    return True


def start_beam_node(owner_key=None, password=None):
    """Start local beam-node with fast_sync"""
    global beam_beam_node_process, node_mode

    if not BEAM_NODE_BINARY.exists():
        return {"error": f"beam-node binary not found at {BEAM_NODE_BINARY}"}

    # Stop existing node and kill any process on the port
    stop_beam_node()
    kill_process_on_port(LOCAL_NODE_PORT)
    time.sleep(1)  # Give port time to be released

    LOGS_DIR.mkdir(exist_ok=True)
    NODE_DATA_DIR.mkdir(exist_ok=True)

    log_file = LOGS_DIR / "beam-node.log"

    # Build command with fast_sync enabled
    node_db_path = NODE_DATA_DIR / "node.db"
    cmd = [
        str(BEAM_NODE_BINARY),
        f"--port={LOCAL_NODE_PORT}",
        f"--storage={node_db_path}",  # Explicit storage path
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
        # Check binary is executable
        if not os.access(str(BEAM_NODE_BINARY), os.X_OK):
            return {"error": f"beam-node binary is not executable: {BEAM_NODE_BINARY}. Try: chmod +x {BEAM_NODE_BINARY}"}

        print(f"[start_beam_node] cmd: {' '.join(cmd)}")
        print(f"[start_beam_node] cwd: {NODE_DATA_DIR}")

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
            (STATE_DIR / ".node.pid").write_text(str(beam_beam_node_process.pid))
            (STATE_DIR / ".node_mode").write_text("local")
            print(f"Started beam-node (PID: {beam_beam_node_process.pid})")
            return {"success": True, "pid": beam_beam_node_process.pid}
        else:
            # Check if process exited immediately (common with Gatekeeper blocks)
            exit_code = beam_beam_node_process.poll()
            error_msg = ""
            if log_file.exists():
                log_content = log_file.read_text()
                error_msg = log_content[-500:] if log_content else ""
            if exit_code is not None:
                error_msg = f"beam-node exited immediately with code {exit_code}. {error_msg}"
                if exit_code == -9 or exit_code == 137:
                    error_msg += " (Killed - possibly macOS Gatekeeper. Try: xattr -dr com.apple.quarantine " + str(BEAM_NODE_BINARY) + ")"
            if not error_msg:
                error_msg = "Node failed to start - check logs"
            print(f"[start_beam_node] FAILED: {error_msg}")
            return {"error": error_msg}

    except PermissionError as e:
        return {"error": f"Permission denied running beam-node: {e}. Try: chmod +x {BEAM_NODE_BINARY}"}
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

    print(f"[switch_to_local_node] === STEP 0: Starting switch for '{target_wallet}' ===")

    # Step 1: Export owner key (this stops wallet-api temporarily)
    print(f"[switch_to_local_node] === STEP 1: Exporting owner key ===")
    owner_result = export_owner_key(target_wallet, password)
    if not owner_result.get("success"):
        print(f"[switch_to_local_node] Failed to export owner key: {owner_result}")
        return owner_result

    owner_key = owner_result.get("owner_key")
    print(f"[switch_to_local_node] Owner key exported: {owner_key[:20]}...")
    print(f"[switch_to_local_node] Node running after export? {is_node_running()}")

    # Step 2: Stop any existing node
    print(f"[switch_to_local_node] === STEP 2: Stopping existing node ===")
    stop_beam_node()
    time.sleep(1)
    print(f"[switch_to_local_node] Node running after stop? {is_node_running()}")

    # Step 3: Start node with owner key
    print(f"[switch_to_local_node] === STEP 3: Starting node with owner key ===")
    node_result = start_beam_node(owner_key, password)
    print(f"[switch_to_local_node] start_beam_node result: {node_result}")
    print(f"[switch_to_local_node] Node running after start? {is_node_running()}")

    if "error" in node_result:
        # Fallback: start without owner key
        print(f"[switch_to_local_node] Warning: Could not start with owner key, trying without...")
        node_result = start_beam_node()
        print(f"[switch_to_local_node] start_beam_node (no key) result: {node_result}")
        if "error" in node_result:
            return node_result

    # Step 4: Wait for node to initialize
    print(f"[switch_to_local_node] === STEP 4: Waiting 3s for node ===")
    time.sleep(3)
    print(f"[switch_to_local_node] Node running after wait? {is_node_running()}")

    # Step 5: Start wallet-api with local node
    print(f"[switch_to_local_node] === STEP 5: Starting wallet-api with {LOCAL_NODE_ADDR} ===")
    result = start_wallet_api(target_wallet, password, LOCAL_NODE_ADDR)
    print(f"[switch_to_local_node] start_wallet_api result: {result}")
    print(f"[switch_to_local_node] Node running after wallet-api start? {is_node_running()}")

    if result.get("success"):
        node_mode = "local"
        (STATE_DIR / ".node_mode").write_text("local")
        print(f"[switch_to_local_node] === SUCCESS: Switched to local node! ===")
    else:
        print(f"[switch_to_local_node] === FAILED: {result} ===")

    return result


def fast_switch_node(mode, node_addr=None):
    """Fast node switch — just restart wallet-api with different node address.
    Local node must already be running for 'local' mode.
    Uses stored password so no client password needed."""
    global node_mode, active_password

    # Save wallet name before start_wallet_api clears it via stop_wallet_api
    wallet_name = active_wallet
    if not wallet_name:
        return {"error": "No active wallet"}
    if not active_password:
        return {"error": "No stored password. Re-unlock wallet."}

    if mode == "local":
        if not is_node_running():
            return {"error": "Local node is not running"}
        target_node = LOCAL_NODE_ADDR
    else:
        target_node = node_addr or DEFAULT_NODE

    # Just restart wallet-api with new node address
    result = start_wallet_api(wallet_name, active_password, target_node)

    if result.get("success"):
        node_mode = mode
        (STATE_DIR / ".node_mode").write_text(mode)

    return result


def start_wallet_api(wallet_name, password, node_addr=None):
    """Start wallet-api for given wallet"""
    global wallet_api_process, active_wallet

    wallet_path = WALLETS_DIR / wallet_name / "wallet.db"
    if not wallet_path.exists():
        return {"error": f"Wallet '{wallet_name}' not found"}

    if not WALLET_API_BINARY.exists():
        return {"error": f"wallet-api binary not found at {WALLET_API_BINARY}"}

    # Stop existing wallet-api and kill any process on the port
    stop_wallet_api()
    kill_process_on_port(WALLET_API_PORT)
    time.sleep(1)  # Give port time to be released

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
                (STATE_DIR / ".active_wallet").write_text(wallet_name)
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

    # Stop existing node using the proper function (doesn't kill all nodes)
    stop_beam_node()
    time.sleep(1)

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
        elif self.path.startswith("/api/p2p/orders"):
            self.handle_p2p_get_orders()
        elif self.path.startswith("/api/p2p/trades/") and "/messages" in self.path:
            self.handle_p2p_get_messages()
        elif self.path.startswith("/api/p2p/trades"):
            self.handle_p2p_get_trades()
        elif self.path.startswith("/api/p2p/reputation"):
            self.handle_p2p_get_reputation()
        elif self.path.startswith("/api/p2p/feedbacks"):
            self.handle_p2p_get_feedbacks()
        elif self.path in ('/favicon.png', '/manifest.json', '/icon-192.png', '/icon-512.png'):
            # Serve PWA assets from src/ directory
            self.path = "/src" + self.path
            super().do_GET()
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
        elif self.path.startswith("/p2p/"):
            # Serve P2P module files
            self.path = "/src" + self.path
            super().do_GET()
        elif self.path.startswith("/explorer") or self.path in ["/", "/dashboard", "/assets", "/transactions", "/addresses", "/dex", "/p2p", "/airdrop", "/appstore", "/fuddle", "/settings", "/donate"]:
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
                "p2p": "p2p",
                "airdrop": "airdrop",
                "explorer": "explorer",
                "appstore": "appstore",
                "fuddle": "fuddle",
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
        elif self.path == "/api/cleanup":
            self.handle_cleanup()
        elif self.path == "/api/shutdown":
            self.handle_shutdown()
        elif self.path == "/api/update":
            self.handle_update()
        elif self.path == "/api/p2p/orders":
            self.handle_p2p_create_order()
        elif self.path == "/api/p2p/trades":
            self.handle_p2p_create_trade()
        elif self.path == "/api/p2p/feedback":
            self.handle_p2p_submit_feedback()
        elif self.path.startswith("/api/p2p/trades/") and "/messages" in self.path:
            self.handle_p2p_send_message()
        elif self.path.startswith("/api/p2p/trades/") and "/confirm" in self.path:
            self.handle_p2p_confirm_trade()
        elif self.path.startswith("/api/p2p/trades/") and "/dispute" in self.path:
            self.handle_p2p_open_dispute()
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

        state_file = STATE_DIR / ".active_wallet"
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
        elif (BASE_DIR / "start.sh").exists():
            install_type = "git"  # start.sh script method

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

    def handle_cleanup(self):
        """Kill stale wallet-api and beam-node for fresh start"""
        stop_wallet_api()
        stop_beam_node()
        self.send_json({"success": True})

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
            global active_password
            body = self.get_json_body()
            mode = body.get("mode", "public")
            password = body.get("password") or active_password
            wallet_name = body.get("wallet")
            node_addr = body.get("node")

            if not password:
                self.send_json({"error": "No password available. Re-unlock wallet."}, 400)
                return

            # Store password if provided by client
            if body.get("password"):
                active_password = body["password"]

            if mode == "local" and is_node_running():
                # Fast path: local node already running, just restart wallet-api
                result = fast_switch_node("local")
            elif mode == "public":
                # Fast path: just restart wallet-api with public node
                result = fast_switch_node("public", node_addr)
            else:
                # Fallback: full switch (start node from scratch)
                result = switch_to_local_node(password, wallet_name)

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
            global node_mode, active_password, active_owner_key
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

            # If node_mode is local and no explicit node_addr, use switch_to_local_node
            # which properly exports owner key and starts node with it
            if node_mode == "local" and not node_addr:
                print(f"[handle_unlock] Local mode detected, using switch_to_local_node...")
                result = switch_to_local_node(password, wallet_name)
                if result.get("success"):
                    active_password = password
                status = 401 if "password" in result.get("error", "").lower() else (200 if "success" in result else 500)
                self.send_json(result, status)
                return

            result = start_wallet_api(wallet_name, password, node_addr)
            if result.get("success"):
                active_password = password
            status = 401 if "password" in result.get("error", "").lower() else (200 if "success" in result else 500)
            self.send_json(result, status)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_lock(self):
        global active_password, active_owner_key
        stop_wallet_api()
        stop_beam_node()
        active_password = None
        active_owner_key = None
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
            global active_password, active_owner_key
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
            if result.get("success"):
                active_password = password
                active_owner_key = result.get("owner_key")
            self.send_json(result, 200 if "success" in result else 400)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def proxy_to_wallet_api(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b""

            # Inject shader for invoke_contract calls (DEX, Minter, BlackHole, P2P)
            if body:
                try:
                    data = json.loads(body)
                    if (data.get("method") == "invoke_contract" and
                        "contract" not in data.get("params", {})):
                        args = data.get("params", {}).get("args", "")
                        # Inject DEX shader
                        if DEX_SHADER and DEX_CONTRACT_ID in args:
                            data["params"]["contract"] = DEX_SHADER
                            body = json.dumps(data).encode()
                        # Inject Minter shader
                        elif MINTER_SHADER and MINTER_CONTRACT_ID in args:
                            data["params"]["contract"] = MINTER_SHADER
                            body = json.dumps(data).encode()
                        # Inject BlackHole shader for burn operations
                        elif BLACKHOLE_SHADER and BLACKHOLE_CONTRACT_ID in args:
                            data["params"]["contract"] = BLACKHOLE_SHADER
                            body = json.dumps(data).encode()
                        # Inject P2P Escrow shader for P2P marketplace
                        elif P2P_ESCROW_SHADER and P2P_ESCROW_CONTRACT_ID in args:
                            data["params"]["contract"] = P2P_ESCROW_SHADER
                            body = json.dumps(data).encode()
                        # Inject Airdrop shader for voucher airdrops
                        elif AIRDROP_SHADER and AIRDROP_CONTRACT_ID and AIRDROP_CONTRACT_ID in args:
                            data["params"]["contract"] = AIRDROP_SHADER
                            body = json.dumps(data).encode()
                        # Inject Fuddle shader for on-chain Wordle game
                        elif FUDDLE_SHADER and FUDDLE_CONTRACT_ID and FUDDLE_CONTRACT_ID in args:
                            data["params"]["contract"] = FUDDLE_SHADER
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

    # ============================================
    # P2P MARKETPLACE HANDLERS
    # ============================================

    def handle_p2p_get_orders(self):
        """Get P2P orders list with optional filters"""
        try:
            # Parse query parameters
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)

            # Load orders from JSON file
            orders_file = BASE_DIR / "p2p_data" / "orders.json"
            if orders_file.exists():
                with open(orders_file, "r") as f:
                    data = json.load(f)
                orders = data.get("orders", [])
            else:
                orders = []

            # Apply filters
            asset = params.get("asset", [None])[0]
            side = params.get("side", [None])[0]
            currency = params.get("currency", [None])[0]

            if asset:
                orders = [o for o in orders if str(o.get("asset")) == asset]
            if side:
                orders = [o for o in orders if o.get("type") == side]
            if currency:
                orders = [o for o in orders if o.get("currency") == currency]

            self.send_json({"orders": orders, "total": len(orders)})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_create_order(self):
        """Create a new P2P order"""
        try:
            body = self.get_json_body()

            # Validate required fields
            required = ["asset", "amount", "price", "currency", "paymentMethods"]
            for field in required:
                if field not in body:
                    self.send_json({"error": f"Missing required field: {field}"}, 400)
                    return

            # Generate order ID
            import uuid
            order_id = str(uuid.uuid4())[:8]

            # Create order object
            order = {
                "id": order_id,
                "type": body.get("type", "sell"),
                "asset": body["asset"],
                "amount": body["amount"],
                "price": body["price"],
                "currency": body["currency"],
                "minLimit": body.get("minLimit", 10),
                "maxLimit": body.get("maxLimit", 500),
                "paymentMethods": body["paymentMethods"],
                "paymentDetails": body.get("paymentDetails", ""),
                "status": "open",
                "seller": body.get("seller", {}),
                "createdAt": int(time.time() * 1000)
            }

            # Load existing orders
            orders_file = BASE_DIR / "p2p_data" / "orders.json"
            if orders_file.exists():
                with open(orders_file, "r") as f:
                    data = json.load(f)
            else:
                data = {"orders": [], "lastUpdated": 0}

            # Add new order
            data["orders"].append(order)
            data["lastUpdated"] = int(time.time() * 1000)

            # Save
            with open(orders_file, "w") as f:
                json.dump(data, f, indent=2)

            self.send_json({"success": True, "order": order})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_get_trades(self):
        """Get P2P trades list"""
        try:
            trades_file = BASE_DIR / "p2p_data" / "trades.json"
            if trades_file.exists():
                with open(trades_file, "r") as f:
                    data = json.load(f)
                trades = data.get("trades", [])
            else:
                trades = []

            self.send_json({"trades": trades, "total": len(trades)})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_create_trade(self):
        """Start a new P2P trade"""
        try:
            body = self.get_json_body()

            if "orderId" not in body:
                self.send_json({"error": "Missing orderId"}, 400)
                return

            # Load order
            orders_file = BASE_DIR / "p2p_data" / "orders.json"
            if not orders_file.exists():
                self.send_json({"error": "Order not found"}, 404)
                return

            with open(orders_file, "r") as f:
                orders_data = json.load(f)

            order = next((o for o in orders_data["orders"] if o["id"] == body["orderId"]), None)
            if not order:
                self.send_json({"error": "Order not found"}, 404)
                return

            # Generate trade ID
            import uuid
            trade_id = str(uuid.uuid4())[:4].upper()

            # Create trade object
            trade = {
                "id": trade_id,
                "orderId": body["orderId"],
                "asset": order["asset"],
                "amount": body.get("amount", order["amount"]),
                "price": order["price"],
                "currency": order["currency"],
                "payAmount": body.get("payAmount", 0),
                "seller": order.get("seller", {}),
                "buyer": body.get("buyer", {}),
                "status": "awaiting_payment",
                "createdAt": int(time.time() * 1000),
                "paymentDeadline": int(time.time() * 1000) + 30 * 60 * 1000  # 30 min
            }

            # Load trades
            trades_file = BASE_DIR / "p2p_data" / "trades.json"
            if trades_file.exists():
                with open(trades_file, "r") as f:
                    trades_data = json.load(f)
            else:
                trades_data = {"trades": [], "lastUpdated": 0}

            trades_data["trades"].append(trade)
            trades_data["lastUpdated"] = int(time.time() * 1000)

            with open(trades_file, "w") as f:
                json.dump(trades_data, f, indent=2)

            # Update order status
            for o in orders_data["orders"]:
                if o["id"] == body["orderId"]:
                    o["status"] = "in_trade"
            with open(orders_file, "w") as f:
                json.dump(orders_data, f, indent=2)

            self.send_json({"success": True, "trade": trade})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_get_reputation(self):
        """Get trader reputation"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(self.path)
            # Extract address from path: /api/p2p/reputation/{address}
            parts = parsed.path.split("/")
            address = parts[-1] if len(parts) > 4 else None

            rep_file = BASE_DIR / "p2p_data" / "reputation.json"
            if rep_file.exists():
                with open(rep_file, "r") as f:
                    data = json.load(f)
                traders = data.get("traders", {})
            else:
                traders = {}

            if address and address in traders:
                self.send_json({"reputation": traders[address]})
            elif address:
                # Return default reputation for new trader
                self.send_json({
                    "reputation": {
                        "address": address,
                        "trustScore": 0,
                        "totalTrades": 0,
                        "successfulTrades": 0,
                        "avgReleaseTime": 0,
                        "disputesWon": 0,
                        "disputesLost": 0,
                        "feedbackCount": 0,
                        "avgRating": 0,
                        "feedbacks": []
                    }
                })
            else:
                self.send_json({"traders": traders})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_submit_feedback(self):
        """Submit verified feedback for a trade"""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)

            trade_id = data.get("tradeId")
            target_address = data.get("targetAddress")
            rating = data.get("rating", 5)
            comment = data.get("comment", "")
            from_address = data.get("fromAddress")

            if not trade_id or not target_address:
                self.send_json({"error": "Missing tradeId or targetAddress"}, 400)
                return

            if rating < 1 or rating > 5:
                self.send_json({"error": "Rating must be 1-5"}, 400)
                return

            # Load trades to verify the trade exists and is completed
            trades_file = BASE_DIR / "p2p_data" / "trades.json"
            if trades_file.exists():
                with open(trades_file, "r") as f:
                    trades_data = json.load(f)
                trades = trades_data.get("trades", [])
            else:
                trades = []

            # Find the trade
            trade = next((t for t in trades if t.get("id") == trade_id), None)
            if not trade:
                self.send_json({"error": "Trade not found"}, 404)
                return

            if trade.get("status") != "completed":
                self.send_json({"error": "Can only submit feedback for completed trades"}, 400)
                return

            # Verify the caller was part of the trade
            buyer = trade.get("buyer", {}).get("address")
            seller = trade.get("seller", {}).get("address")
            if from_address and from_address not in [buyer, seller]:
                self.send_json({"error": "Only trade participants can submit feedback"}, 403)
                return

            # Verify target is the OTHER party
            if from_address == target_address:
                self.send_json({"error": "Cannot leave feedback for yourself"}, 400)
                return

            # Load reputation file
            rep_file = BASE_DIR / "p2p_data" / "reputation.json"
            if rep_file.exists():
                with open(rep_file, "r") as f:
                    rep_data = json.load(f)
            else:
                rep_data = {"traders": {}, "feedbacks": [], "lastUpdated": 0}

            # Check if feedback already submitted for this trade by this user
            existing = [f for f in rep_data.get("feedbacks", [])
                       if f.get("tradeId") == trade_id and f.get("from") == from_address]
            if existing:
                self.send_json({"error": "Already submitted feedback for this trade"}, 400)
                return

            # Create feedback entry
            feedback = {
                "id": f"fb_{int(time.time())}_{trade_id[:8]}",
                "tradeId": trade_id,
                "from": from_address,
                "to": target_address,
                "rating": rating,
                "comment": comment,
                "createdAt": int(time.time()),
                "verified": True
            }

            # Add to feedbacks list
            if "feedbacks" not in rep_data:
                rep_data["feedbacks"] = []
            rep_data["feedbacks"].append(feedback)

            # Update trader reputation
            if target_address not in rep_data["traders"]:
                rep_data["traders"][target_address] = {
                    "address": target_address,
                    "trustScore": 50,
                    "totalTrades": 0,
                    "successfulTrades": 0,
                    "avgReleaseTime": 0,
                    "disputesWon": 0,
                    "disputesLost": 0,
                    "feedbackCount": 0,
                    "totalRating": 0,
                    "avgRating": 0
                }

            trader = rep_data["traders"][target_address]
            trader["feedbackCount"] = trader.get("feedbackCount", 0) + 1
            trader["totalRating"] = trader.get("totalRating", 0) + rating
            trader["avgRating"] = round(trader["totalRating"] / trader["feedbackCount"], 2)

            # Recalculate trust score based on feedback
            base_score = 50 + (trader["avgRating"] - 3) * 10  # 3 stars = 50%, 5 stars = 70%
            trade_bonus = min(30, trader.get("successfulTrades", 0) * 0.5)  # Up to 30% from trades
            trader["trustScore"] = min(100, max(0, round(base_score + trade_bonus)))

            rep_data["lastUpdated"] = int(time.time())

            # Save
            with open(rep_file, "w") as f:
                json.dump(rep_data, f, indent=4)

            self.send_json({
                "success": True,
                "feedback": feedback,
                "traderReputation": trader
            })

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_get_feedbacks(self):
        """Get feedbacks for a trader"""
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)

            address = query.get("address", [None])[0]
            skip = int(query.get("skip", [0])[0])
            limit = int(query.get("limit", [20])[0])

            rep_file = BASE_DIR / "p2p_data" / "reputation.json"
            if rep_file.exists():
                with open(rep_file, "r") as f:
                    rep_data = json.load(f)
                feedbacks = rep_data.get("feedbacks", [])
            else:
                feedbacks = []

            # Filter by address if provided
            if address:
                feedbacks = [f for f in feedbacks if f.get("to") == address]

            # Sort by date descending
            feedbacks.sort(key=lambda x: x.get("createdAt", 0), reverse=True)

            total = len(feedbacks)
            feedbacks = feedbacks[skip:skip + limit]

            # Calculate average
            if feedbacks:
                avg_rating = sum(f.get("rating", 0) for f in feedbacks) / len(feedbacks)
            else:
                avg_rating = 0

            self.send_json({
                "feedbacks": feedbacks,
                "totalCount": total,
                "avgRating": round(avg_rating, 2)
            })

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_get_messages(self):
        """Get chat messages for a trade"""
        try:
            from urllib.parse import urlparse, parse_qs
            # Extract trade_id from path: /api/p2p/trades/{trade_id}/messages
            parts = self.path.split("/")
            trade_id = parts[4] if len(parts) > 4 else None

            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            after_id = int(query.get("after", [0])[0])

            messages_file = BASE_DIR / "p2p_data" / "messages.json"
            if messages_file.exists():
                with open(messages_file, "r") as f:
                    all_messages = json.load(f)
            else:
                all_messages = {}

            trade_messages = all_messages.get(trade_id, [])

            # Filter by after_id if provided
            if after_id > 0:
                trade_messages = [m for m in trade_messages if m.get("id", 0) > after_id]

            self.send_json({"messages": trade_messages})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_send_message(self):
        """Send chat message in a trade"""
        try:
            # Extract trade_id from path
            parts = self.path.split("/")
            trade_id = parts[4] if len(parts) > 4 else None

            if not trade_id:
                self.send_json({"error": "Missing trade_id"}, 400)
                return

            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)

            text = data.get("text", "").strip()
            sender = data.get("sender", "")

            if not text:
                self.send_json({"error": "Message text required"}, 400)
                return

            messages_file = BASE_DIR / "p2p_data" / "messages.json"
            if messages_file.exists():
                with open(messages_file, "r") as f:
                    all_messages = json.load(f)
            else:
                all_messages = {}

            if trade_id not in all_messages:
                all_messages[trade_id] = []

            message = {
                "id": int(time.time() * 1000),
                "tradeId": trade_id,
                "sender": sender,
                "text": text,
                "timestamp": int(time.time() * 1000)
            }

            all_messages[trade_id].append(message)

            with open(messages_file, "w") as f:
                json.dump(all_messages, f, indent=2)

            self.send_json({"success": True, "message": message})

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_confirm_trade(self):
        """Confirm payment received and complete trade"""
        try:
            # Extract trade_id from path
            parts = self.path.split("/")
            trade_id = parts[4] if len(parts) > 4 else None

            if not trade_id:
                self.send_json({"error": "Missing trade_id"}, 400)
                return

            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)

            confirmed_by = data.get("confirmedBy", "")

            # Load trades
            trades_file = BASE_DIR / "p2p_data" / "trades.json"
            if trades_file.exists():
                with open(trades_file, "r") as f:
                    trades_data = json.load(f)
            else:
                trades_data = {"trades": [], "lastUpdated": 0}

            # Find and update trade
            trade = None
            for t in trades_data.get("trades", []):
                if t.get("id") == trade_id:
                    trade = t
                    break

            if not trade:
                self.send_json({"error": "Trade not found"}, 404)
                return

            # Update trade status
            trade["status"] = "completed"
            trade["completedAt"] = int(time.time())
            trade["confirmedBy"] = confirmed_by

            trades_data["lastUpdated"] = int(time.time())

            with open(trades_file, "w") as f:
                json.dump(trades_data, f, indent=4)

            # Update reputation stats
            self._update_trade_reputation(trade)

            self.send_json({
                "success": True,
                "trade": trade
            })

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_p2p_open_dispute(self):
        """Open dispute for a trade"""
        try:
            # Extract trade_id from path
            parts = self.path.split("/")
            trade_id = parts[4] if len(parts) > 4 else None

            if not trade_id:
                self.send_json({"error": "Missing trade_id"}, 400)
                return

            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)

            reason = data.get("reason", "")
            description = data.get("description", "")
            opened_by = data.get("openedBy", "")

            # Load trades
            trades_file = BASE_DIR / "p2p_data" / "trades.json"
            if trades_file.exists():
                with open(trades_file, "r") as f:
                    trades_data = json.load(f)
            else:
                self.send_json({"error": "Trade not found"}, 404)
                return

            # Find and update trade
            trade = None
            for t in trades_data.get("trades", []):
                if t.get("id") == trade_id:
                    trade = t
                    break

            if not trade:
                self.send_json({"error": "Trade not found"}, 404)
                return

            # Create dispute
            dispute_id = f"D{int(time.time())}"
            trade["status"] = "disputed"
            trade["dispute"] = {
                "id": dispute_id,
                "reason": reason,
                "description": description,
                "openedBy": opened_by,
                "openedAt": int(time.time()),
                "status": "pending",
                "escrows": [],  # Will be assigned by contract
                "votes": {}
            }

            trades_data["lastUpdated"] = int(time.time())

            with open(trades_file, "w") as f:
                json.dump(trades_data, f, indent=4)

            self.send_json({
                "success": True,
                "disputeId": dispute_id,
                "trade": trade
            })

        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def _update_trade_reputation(self, trade):
        """Update reputation after trade completion"""
        try:
            rep_file = BASE_DIR / "p2p_data" / "reputation.json"
            if rep_file.exists():
                with open(rep_file, "r") as f:
                    rep_data = json.load(f)
            else:
                rep_data = {"traders": {}, "feedbacks": [], "lastUpdated": 0}

            # Update both parties
            for party in ["buyer", "seller"]:
                address = trade.get(party, {}).get("address")
                if not address:
                    continue

                if address not in rep_data["traders"]:
                    rep_data["traders"][address] = {
                        "address": address,
                        "trustScore": 50,
                        "totalTrades": 0,
                        "successfulTrades": 0,
                        "avgReleaseTime": 0,
                        "disputesWon": 0,
                        "disputesLost": 0,
                        "feedbackCount": 0,
                        "totalRating": 0,
                        "avgRating": 0
                    }

                trader = rep_data["traders"][address]
                trader["totalTrades"] = trader.get("totalTrades", 0) + 1
                trader["successfulTrades"] = trader.get("successfulTrades", 0) + 1

                # Recalculate trust score
                base = 50
                trade_bonus = min(30, trader["successfulTrades"] * 0.5)
                rating_bonus = (trader.get("avgRating", 3) - 3) * 5
                trader["trustScore"] = min(100, max(0, round(base + trade_bonus + rating_bonus)))

            rep_data["lastUpdated"] = int(time.time())

            with open(rep_file, "w") as f:
                json.dump(rep_data, f, indent=4)

        except Exception as e:
            print(f"Failed to update reputation: {e}")

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

    WALLETS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    NODE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (BINARIES_DIR / PLATFORM).mkdir(parents=True, exist_ok=True)

    running = is_wallet_api_running()
    state_file = STATE_DIR / ".active_wallet"
    wallet_name = state_file.read_text().strip() if state_file.exists() else "none"

    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║             BEAM Light Wallet - Web Server                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Web UI:      http://127.0.0.1:{PORT}/                              ║
║  API Proxy:   http://127.0.0.1:{PORT}/api/wallet                    ║
╠══════════════════════════════════════════════════════════════════╣
║  Data dir:    {str(DATA_DIR):<40} ║
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

    # Allow socket reuse to avoid "Address already in use" errors
    class ReusableHTTPServer(HTTPServer):
        allow_reuse_address = True

    server = ReusableHTTPServer(("127.0.0.1", PORT), WalletProxyHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        shutdown_all()
        server.server_close()
        print("Server stopped.")


if __name__ == "__main__":
    main()
