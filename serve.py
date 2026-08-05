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
import atexit
import json
import signal
import subprocess
import time
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.error
import urllib.parse
import tempfile
import threading
from pathlib import Path

# The one definition of a legal wallet name. Anything that reaches the
# filesystem must be matched against this first.
WALLET_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Configuration
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Minted fresh every run and injected into index.html. A cross-origin page can
# reach this server but cannot read the page, so it can never learn this value.
import secrets as _secrets
SESSION_TOKEN = _secrets.token_urlsafe(32)

# wallet-api's own authentication. Distinct from SESSION_TOKEN, and crucially it
# is NEVER sent to the browser.
#
# wallet-api listens on a fixed port with no Origin, Host or CSRF checking of any
# kind, so any page in the user's browser could POST tx_send straight to it and
# skip every guard in this file. Content-Type: text/plain makes it a CORS
# "simple" request, so there is no preflight to refuse - and the attacker never
# needs to read the reply, because the transaction is already signed and
# broadcast. Verified in a real browser from a different origin.
#
# --ip_whitelist does not help there: the malicious page runs on this machine, so
# the request genuinely arrives from 127.0.0.1. wallet-api's ACL does help - it
# requires a "key" field in the JSON-RPC body, and only this process knows it.

WALLET_API_URL = "http://127.0.0.1:10000/api/wallet"
WALLET_API_PORT = 10000
BASE_DIR = Path(__file__).parent.absolute()

# All private data (binaries, wallets, logs, node_data) stored in ~/.beam-light-wallet
# This keeps user data in a consistent location regardless of how the app was installed
# Everything writable lives outside the application. A signed .app bundle is
# sealed and cannot be written to, so the launcher used to symlink these
# directories into Contents/Resources — which breaks the seal on first run and
# makes macOS refuse to launch the app at all. BEAM_DATA_DIR lets a packaged
# build point somewhere else without any of that.
DATA_DIR = Path(os.environ.get("BEAM_DATA_DIR") or (Path.home() / ".beam-light-wallet"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
# The wallet database, the logs and the transient secret configs all live here.
# Default mkdir gives 0755, so every local account could read them.
try:
    os.chmod(DATA_DIR, 0o700)
except OSError:
    pass

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


# ============================================
# CROSS-PLATFORM PROCESS HELPERS
# ============================================

def find_pid_by_name(name):
    """Find PID of process by name (cross-platform)"""
    try:
        if PLATFORM == "windows":
            exe_name = name if name.endswith(".exe") else f"{name}.exe"
            result = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {exe_name}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5
            )
            # CSV format: "process.exe","PID","Session","#","Mem"
            for line in result.stdout.strip().split('\n'):
                if line.startswith('"'):
                    parts = line.split(',')
                    if len(parts) >= 2:
                        return int(parts[1].strip('"'))
        else:
            result = subprocess.run(
                ["pgrep", "-f", name], capture_output=True, text=True
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip().split()[0])
    except Exception:
        pass
    return None


def kill_pid(pid, force=False):
    """Kill process by PID (cross-platform)"""
    try:
        if PLATFORM == "windows":
            cmd = ["taskkill", "/PID", str(pid)]
            if force:
                cmd.append("/F")
            subprocess.run(cmd, capture_output=True, timeout=5)
        else:
            sig = signal.SIGKILL if force else signal.SIGTERM
            os.kill(pid, sig)
    except Exception:
        pass


def kill_by_name(name):
    """Kill all processes matching name (cross-platform)"""
    try:
        if PLATFORM == "windows":
            exe_name = name if name.endswith(".exe") else f"{name}.exe"
            subprocess.run(
                ["taskkill", "/F", "/IM", exe_name],
                capture_output=True, timeout=5
            )
        else:
            subprocess.run(
                ["pkill", "-f", name], capture_output=True
            )
    except Exception:
        pass


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
FUDDLE_CONTRACT_ID = "d08237dd9491a42383f7d01e07bf2f61be9e3e0a8a9cfc7c98a50914343644c0"

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

# MemeClash Contract - Meme battle game ($CHAD vs $GIGA)
# Set after deployment (placeholder until deployed)
MEMECLASH_CONTRACT_ID = "d753ecb032b59f95d83bda64d5ed67baecc78068428be0cfae44c4dc2e4b6282"

# Load MemeClash shader bytes for meme battle game
MEMECLASH_SHADER = None
try:
    shader_path = BASE_DIR / "shaders" / "memeclash_app.wasm"
    if shader_path.exists():
        with open(shader_path, "rb") as f:
            MEMECLASH_SHADER = list(f.read())
        print(f"Loaded MemeClash shader: {len(MEMECLASH_SHADER)} bytes")
except Exception as e:
    print(f"Warning: Could not load MemeClash shader: {e}")

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

# Persisted for the lifetime of the wallet-api process, NOT per serve.py run.
#
# Generating it per run looked tidier, but wallet-api outlives serve.py: restart
# the server (crash, manual restart, the updater's os.execl) while the wallet is
# unlocked and every call fails with "Unknown API key" until the user works out
# they must lock and unlock. Measured that exact failure.
#
# The file is 0600 inside a 0700 directory, and it only authorises calls that
# already had to come from loopback. A key on disk is a smaller problem than a
# wallet that silently stops working.
WALLET_API_KEY_FILE = STATE_DIR / ".wallet_api_acl.key"


def _load_or_make_acl_key():
    try:
        if WALLET_API_KEY_FILE.exists():
            existing = WALLET_API_KEY_FILE.read_text(encoding="utf-8").strip()
            if existing:
                return existing
    except OSError:
        pass
    return _secrets.token_urlsafe(32)


WALLET_API_ACL_KEY = _load_or_make_acl_key()

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

    # Also kill any orphaned processes (cross-platform)
    kill_by_name("wallet-api")
    kill_by_name("beam-node")

    print("[SHUTDOWN] All services stopped")


def get_wallet_api_pid():
    """Get wallet-api PID if running (cross-platform)"""
    # Check stored process object first (works on all platforms)
    if wallet_api_process and wallet_api_process.poll() is None:
        return wallet_api_process.pid
    # Fallback: search by name
    return find_pid_by_name("wallet-api")


def is_wallet_api_running():
    """Check if wallet-api is responding, and that our ACL key is accepted."""
    try:
        req = urllib.request.Request(
            WALLET_API_URL,
            data=json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "wallet_status",
                # ACL is on, so even a read needs the key.
                "key": WALLET_API_ACL_KEY,
            }).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=2) as response:
            if response.status != 200:
                return False
            # wallet-api answers 200 with a JSON-RPC error body when the key is
            # rejected, so status alone would report a locked-out API as healthy.
            try:
                payload = json.loads(response.read())
            except (ValueError, OSError):
                return False
            return "result" in payload
    except Exception:
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
        if PLATFORM == "windows":
            # Use netstat to find LISTENING process on the port
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.split('\n'):
                if f":{port}" in line and "LISTENING" in line:
                    parts = line.strip().split()
                    if parts:
                        try:
                            pid = int(parts[-1])
                            kill_pid(pid, force=True)
                            print(f"Killed process {pid} on port {port}")
                        except (ValueError, IndexError):
                            pass
            return True
        else:
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
                        kill_pid(pid)
                        print(f"Killed process {pid} on port {port}")
                        time.sleep(1)
                        # Force kill if still running
                        try:
                            os.kill(pid, 0)  # Check if still alive
                            kill_pid(pid, force=True)
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
    """Stop running wallet-api process (cross-platform)"""
    global wallet_api_process, active_wallet

    pid = get_wallet_api_pid()
    if pid:
        kill_pid(pid, force=True)
        # Windows needs more time to release file locks (SQLite db)
        time.sleep(2 if PLATFORM == "windows" else 0.5)

    wallet_api_process = None
    active_wallet = None

    # Also kill any process using the wallet API port
    kill_process_on_port(WALLET_API_PORT)

    # The ACL key is only meaningful while that process lives. Leaving it behind
    # would keep a credential on disk for a wallet that is locked.
    try:
        WALLET_API_KEY_FILE.unlink()
    except OSError:
        pass

    state_file = STATE_DIR / ".active_wallet"
    if state_file.exists():
        state_file.unlink()

    return True


def get_beam_node_pid():
    """Get beam-node PID if running (cross-platform)"""
    # Check stored process object first (works on all platforms)
    if beam_beam_node_process and beam_beam_node_process.poll() is None:
        return beam_beam_node_process.pid
    # Fallback: search by name
    return find_pid_by_name("beam-node")


def is_node_running():
    """Check if local beam-node is running"""
    return get_beam_node_pid() is not None


def get_node_sync_status():
    """Get local node sync status by parsing logs (cross-platform, pure Python)"""
    if not is_node_running():
        return {"running": False, "synced": False, "height": 0, "progress": 0}

    try:
        log_file = LOGS_DIR / "beam-node.log"
        if not log_file.exists():
            return {"running": True, "synced": False, "height": 0, "progress": 0}

        # Read log with encoding fallback (Windows beam-node may write UTF-16)
        content = None
        for enc in ('utf-8', 'utf-16', 'latin-1'):
            try:
                content = log_file.read_text(encoding=enc)
                # UTF-16 read as UTF-8 produces null bytes — retry with correct encoding
                if '\x00' not in content:
                    break
                content = None
            except (UnicodeDecodeError, ValueError):
                continue

        if not content:
            return {"running": True, "synced": False, "height": 0, "progress": 0}

        # Filter relevant lines in pure Python (replaces grep subprocess)
        patterns = ("My Tip:", "Updating node:", "Initial Tip:", "fully synchronized")
        lines = [l for l in content.split('\n') if any(p in l for p in patterns)]
        lines = lines[-50:]  # Last 50 matching lines

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

            # "My Tip" is the node's own height. It says nothing about whether
            # that height is the network's height — a node wedged on a dead
            # fork keeps logging a perfectly plausible tip forever. This used
            # to declare synced=True for any height above a hardcoded 3,000,000,
            # which is how a node stuck at the HF6 boundary reported 100%.
            # Report the height; let the frontend judge it against a real tip.
            if "My Tip:" in line:
                match = re.search(r'My Tip:\s*(\d+)', line)
                if match:
                    current_height = int(match.group(1))

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
    """Stop running beam-node process (cross-platform)"""
    global beam_beam_node_process, node_mode

    pid = get_beam_node_pid()
    if pid:
        try:
            kill_pid(pid)
            time.sleep(2)
            if get_beam_node_pid():
                kill_pid(pid, force=True)
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
    _harden_dir(LOGS_DIR)
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

    # The owner viewer key derives every address this wallet will ever use, so
    # it is at least as sensitive as the password. Neither goes on argv.
    cfg = None
    if owner_key:
        cfg = write_secret_cfg({"owner_key": owner_key, "pass": password}, tag="node")
        cmd.append(f"--config_file={cfg}")
        drop_secret_cfg(cfg, delay=20)

    try:
        # Check binary is executable (skip on Windows where os.X_OK is meaningless)
        if PLATFORM != "windows" and not os.access(str(BEAM_NODE_BINARY), os.X_OK):
            return {"error": f"beam-node binary is not executable: {BEAM_NODE_BINARY}. Try: chmod +x {BEAM_NODE_BINARY}"}

        print(f"[start_beam_node] cmd: {redact(' '.join(cmd), password, owner_key)}")
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

            # Auto-recover from database corruption
            if "orruption" in error_msg or "1row change failed" in error_msg:
                print("[start_beam_node] Database corruption detected, deleting node.db and retrying...")
                try:
                    for f in NODE_DATA_DIR.glob("node.db*"):
                        f.unlink()
                    print("[start_beam_node] Deleted corrupted node database, retrying...")
                    time.sleep(1)
                    with open(log_file, "w") as lf:
                        beam_beam_node_process = subprocess.Popen(
                            cmd, stdout=lf, stderr=subprocess.STDOUT,
                            cwd=str(NODE_DATA_DIR)
                        )
                    time.sleep(3)
                    if is_node_running():
                        node_mode = "local"
                        (STATE_DIR / ".node.pid").write_text(str(beam_beam_node_process.pid))
                        (STATE_DIR / ".node_mode").write_text("local")
                        print(f"Started beam-node after recovery (PID: {beam_beam_node_process.pid})")
                        return {"success": True, "pid": beam_beam_node_process.pid, "recovered": True}
                except Exception as re:
                    error_msg += f" Recovery failed: {re}"

            if not error_msg:
                error_msg = "Node failed to start - check logs"
            print(f"[start_beam_node] FAILED: {error_msg}")
            return {"error": error_msg}

    except PermissionError as e:
        fix_hint = "" if PLATFORM == "windows" else f" Try: chmod +x {BEAM_NODE_BINARY}"
        return {"error": f"Permission denied running beam-node: {e}.{fix_hint}"}
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
    _harden_dir(LOGS_DIR)

    log_file = LOGS_DIR / f"{wallet_name}_api.log"
    node = node_addr or DEFAULT_NODE

    # wallet-api is long-lived, so its argv is visible in `ps` for the whole
    # session. The password goes in a 0600 config that is deleted once the
    # process has read it.
    cfg = write_secret_cfg({"pass": password}, tag="api")
    acl_path = write_acl_file(WALLET_API_ACL_KEY)
    # Survives a serve.py restart so the running wallet-api stays reachable.
    try:
        WALLET_API_KEY_FILE.write_text(WALLET_API_ACL_KEY, encoding="utf-8")
        os.chmod(WALLET_API_KEY_FILE, 0o600)
    except OSError:
        pass
    cmd = [
        str(WALLET_API_BINARY),
        f"--wallet_path={wallet_path}",
        f"--config_file={cfg}",
        f"--node_addr={node}",
        f"--port={WALLET_API_PORT}",
        "--use_http=1",
        # wallet-api binds 0.0.0.0 and offers no bind-address flag, so without
        # this it answers ANY host on the LAN - unauthenticated. Every CSRF and
        # session-token defence on serve.py's port is bypassed by simply talking
        # to port 10000 directly: read balances, addresses and history, and call
        # tx_send. Verified from another address on the same network before this
        # was added. The whitelist is the only mechanism the binary provides.
        "--ip_whitelist=127.0.0.1",
        # Requires a secret "key" in every JSON-RPC body. This is what stops a
        # page in the user's own browser from driving the signing API directly;
        # the whitelist above only stops other machines.
        "--use_acl=1",
        f"--acl_path={acl_path}",
        "--enable_assets",
        "--enable_lelantus"
    ]
    drop_secret_cfg(cfg, delay=20)
    # loadACL runs once at startup, so the file need not outlive it.
    drop_secret_cfg(acl_path, delay=20)

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
    bad_pw = secret_cfg_safe(password)
    if bad_pw:
        return {"error": bad_pw}

    if wallet_dir.exists():
        return {"error": f"Wallet '{wallet_name}' already exists"}

    wallet_dir.mkdir(parents=True, exist_ok=True)
    wallet_path = wallet_dir / "wallet.db"

    cfg = write_secret_cfg({"pass": password}, tag="init")
    cmd = [
        str(WALLET_CLI_BINARY),
        "init",
        f"--wallet_path={wallet_path}",
        f"--config_file={cfg}",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        output = redact(result.stdout + result.stderr, password)

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
        return {"error": redact(str(e), password)}
    finally:
        drop_secret_cfg(cfg)


def restore_wallet(wallet_name, password, seed_phrase):
    """Restore a wallet from seed phrase"""
    if not WALLET_CLI_BINARY.exists():
        return {"error": f"beam-wallet binary not found at {WALLET_CLI_BINARY}"}

    wallet_dir = WALLETS_DIR / wallet_name
    bad_pw = secret_cfg_safe(password)
    if bad_pw:
        return {"error": bad_pw}

    if wallet_dir.exists():
        return {"error": f"Wallet '{wallet_name}' already exists"}

    wallet_dir.mkdir(parents=True, exist_ok=True)
    wallet_path = wallet_dir / "wallet.db"

    # Format seed phrase with semicolons
    words = seed_phrase.strip().split()
    formatted_seed = ';'.join(words) + ';'

    # Both the password and the seed phrase would otherwise sit in `ps` output
    # for the duration of the restore.
    cfg = write_secret_cfg({"pass": password, "seed_phrase": formatted_seed}, tag="restore")
    cmd = [
        str(WALLET_CLI_BINARY),
        "restore",
        f"--wallet_path={wallet_path}",
        f"--config_file={cfg}",
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
            output = redact(result.stdout + result.stderr, password, formatted_seed, seed_phrase)
            return {"error": f"Wallet restore failed: {output[:200]}"}

        return {
            "success": True,
            "wallet": wallet_name,
            "message": "Wallet restored successfully"
        }

    except subprocess.TimeoutExpired:
        return {"error": "Wallet restore timed out"}
    except Exception as e:
        return {"error": redact(str(e), password, formatted_seed, seed_phrase)}
    finally:
        drop_secret_cfg(cfg)


def export_owner_key(wallet_name, password):
    """Export owner key for local node"""
    global wallet_api_process, active_wallet

    if not WALLET_CLI_BINARY.exists():
        return {"error": f"beam-wallet binary not found"}

    wallet_path = WALLETS_DIR / wallet_name / "wallet.db"
    if not wallet_path.exists():
        return {"error": f"Wallet '{wallet_name}' not found"}

    # Stop wallet-api to release database lock
    was_running = wallet_api_process is not None or is_wallet_api_running()
    if was_running:
        stop_wallet_api()
        # Windows needs more time to release SQLite file locks
        time.sleep(3 if PLATFORM == "windows" else 1)

    cfg = write_secret_cfg({"pass": password}, tag="ownerkey")
    cmd = [
        str(WALLET_CLI_BINARY),
        "export_owner_key",
        f"--wallet_path={wallet_path}",
        f"--config_file={cfg}",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        output = redact(result.stdout + result.stderr, password)

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
        return {"error": redact(str(e), password)}
    finally:
        drop_secret_cfg(cfg)


def delete_wallet(wallet_name):
    """Delete a wallet directory"""
    # Defence in depth: the caller validates the name, but this function
    # rmtree's whatever it is handed, so it re-checks containment itself.
    if not WALLET_NAME_RE.match(wallet_name or ""):
        return {"error": "Invalid wallet name"}

    wallet_dir = WALLETS_DIR / wallet_name
    try:
        if wallet_dir.resolve().parent != WALLETS_DIR.resolve():
            return {"error": "Invalid wallet name"}
    except OSError:
        return {"error": "Invalid wallet name"}

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
    rescan_cfg = write_secret_cfg({"owner_key": owner_key, "pass": password}, tag="rescan")
    node_cmd = [
        str(node_binary),
        "--port=10005",
        "--log_level=info",
        "--fast_sync=1",
        "--peer=eu-node01.mainnet.beam.mw:8100",
        "--peer=us-node01.mainnet.beam.mw:8100",
        f"--config_file={rescan_cfg}",
    ]
    drop_secret_cfg(rescan_cfg, delay=20)

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


def load_binaries_manifest():
    """Read config/binaries.json — the one place versions are defined."""
    for candidate in (BASE_DIR / "config" / "binaries.json",
                      Path(__file__).parent / "config" / "binaries.json"):
        try:
            return json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
    return {}


BINARIES_MANIFEST = load_binaries_manifest()
APP_VERSION = BINARIES_MANIFEST.get("app_version", "0.0.0")
MIN_CONSENSUS_HEIGHT = BINARIES_MANIFEST.get("min_consensus_height", 0)


def platform_binary_info():
    """Manifest entry for the platform we are running on."""
    return (BINARIES_MANIFEST.get("platforms") or {}).get(PLATFORM, {})


def sha256_file(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_binary(name, path):
    """Check a downloaded binary against the hash pinned in the manifest.

    The archives ship a *-checksum.txt which the installers already downloaded
    and then ignored. That only proves the file arrived intact from wherever it
    came from; pinning the hash in our own repo is what catches a substituted
    upstream artifact.
    """
    entry = (platform_binary_info().get("binaries") or {}).get(name) or {}
    expected = entry.get("sha256")
    if not expected:
        return {"ok": True, "checked": False, "reason": "no pinned hash for this platform"}
    try:
        actual = sha256_file(path)
    except OSError as e:
        return {"ok": False, "checked": True, "reason": str(e)}
    if actual != expected:
        return {"ok": False, "checked": True,
                "reason": f"{name} sha256 mismatch: expected {expected[:16]}…, got {actual[:16]}…"}
    return {"ok": True, "checked": True}


def consensus_warning():
    """Tell the caller if this platform's pinned BEAM build is fork-stale."""
    info = platform_binary_info()
    if info and info.get("hf6_compatible") is False:
        return {
            "out_of_consensus": True,
            "beam_version": info.get("beam_version"),
            "required_version": (BINARIES_MANIFEST.get("hardfork") or {}).get("min_beam_version"),
            "fork_height": MIN_CONSENSUS_HEIGHT,
            "reason": info.get("unsupported_reason", ""),
        }
    return {"out_of_consensus": False}


def secret_cfg_safe(value):
    """Reject values that boost::program_options would silently mangle.

    Secrets go to the BEAM binaries in a --config_file, because argv is readable
    by any local process through `ps`. But boost's config parser strips a '#'
    comment and trims surrounding whitespace, and it does the comment strip
    BEFORE it handles quotes - so `pass="MyP@ss#2026!"` parses to the literal
    `"MyP@ss`, not the password the user typed. Quoting does not rescue it;
    verified against beam-wallet 7.5, which opened such a wallet with the
    password `"abc`.

    Left alone, a user who chose `MyP@ss#2026!` would get a wallet protected by
    `MyP@ss` - silently, since unlock truncates identically - and would find the
    password rejected the day they restored with the official BEAM tools.

    Checked only when a wallet is created or restored. Unlock deliberately does
    not check, so wallets already created with a '#' keep opening.
    """
    text = str(value)
    if "#" in text:
        return ("Password cannot contain '#'. The BEAM wallet tools treat it as "
                "the start of a comment and would silently cut your password "
                "short at that character.")
    if text != text.strip():
        return ("Password cannot begin or end with a space. The BEAM wallet "
                "tools trim it, so the password you typed would not be the one "
                "stored.")
    return None


def write_secret_cfg(values, tag="beam"):
    """Write BEAM options to a 0600 temp config file and return its path.

    Anything passed on argv is world-readable through `ps`, which for this app
    meant the wallet password, the 12-word seed phrase and the owner viewer key.
    All three BEAM binaries accept --config_file, so secrets go in a file that
    only this user can read and that is deleted as soon as the child has it.
    """
    fd, path = tempfile.mkstemp(prefix=f".{tag}-", suffix=".cfg", dir=str(STATE_DIR))
    os.close(fd)
    os.chmod(path, 0o600)
    with open(path, "w", encoding="utf-8") as f:
        for key, value in values.items():
            if value is not None:
                f.write(f"{key}={value}\n")
    _SECRET_FILES.add(path)
    return path


def _harden_dir(path):
    """0700 a directory we own. Logs and wallet data must not be world-readable."""
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass


def sweep_leaked_secrets():
    """Redact secrets that earlier builds wrote into logs, and drop stale configs.

    Before secrets moved to --config_file they were passed on argv, and argv is
    echoed into serve.log. On this machine that left a real wallet password
    sitting in a 0644 file next to wallet.db - one Time Machine snapshot or one
    cloud-synced home directory carries both. Fixing the leak going forward does
    nothing about the copy already on disk, so sweep it on every start.
    """
    patterns = [
        re.compile(r"(--pass=)[^\s'\"]+"),
        re.compile(r"(--owner_key=)[^\s'\"]+"),
        re.compile(r"(seed_phrase[=:]\s*)[^\n]+"),
        re.compile(r"(\"password\"\s*:\s*\")[^\"]*"),
    ]
    cleaned = 0
    try:
        for log in LOGS_DIR.glob("*.log"):
            try:
                _harden_file(log)
                text = log.read_text(encoding="utf-8", errors="replace")
                new_text = text
                for pat in patterns:
                    new_text = pat.sub(r"\1<redacted>", new_text)
                if new_text != text:
                    log.write_text(new_text, encoding="utf-8")
                    cleaned += 1
            except OSError:
                continue
    except OSError:
        pass

    # Secret configs are meant to be deleted once the child has read them, but a
    # crash or a kill leaves them behind - they contain the password verbatim.
    stale = 0
    for leftover in list(STATE_DIR.glob(".*.cfg")) + list(STATE_DIR.glob(".*.acl")):
        try:
            leftover.unlink()
            stale += 1
        except OSError:
            pass
    if cleaned or stale:
        print(f"[security] redacted secrets in {cleaned} log file(s), removed {stale} stale secret file(s)")

    prune_logs()


# Logs are never rotated by the BEAM binaries, and two files here had already
# reached 4.3 MB. For a privacy coin they are not innocuous: wallet-api logs
# carry addresses and transaction detail, so an unbounded pile of them is a
# growing record of everything the wallet has ever done.
LOG_RETENTION_BYTES = 50 * 1024 * 1024
LOG_RETENTION_COUNT = 20


def prune_logs():
    """Keep the log directory bounded, oldest first.

    Only touches files nothing is writing to: the newest LOG_RETENTION_COUNT are
    always kept, which covers the current session's open handles.
    """
    try:
        logs = sorted(
            (f for f in LOGS_DIR.glob("*.log") if f.is_file()),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return

    removed = 0
    freed = 0
    total = 0
    for i, f in enumerate(logs):
        try:
            size = f.stat().st_size
        except OSError:
            continue
        total += size
        too_many = i >= LOG_RETENTION_COUNT
        too_big = total > LOG_RETENTION_BYTES and i >= 3  # never touch the live ones
        if too_many or too_big:
            try:
                f.unlink()
                removed += 1
                freed += size
            except OSError:
                pass
    if removed:
        print(f"[logs] pruned {removed} old log file(s), freed {freed // 1024} KB")


def _harden_file(path):
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _harden_dir_noop():
    pass


def write_acl_file(key):
    """Write a 0600 wallet-api ACL granting one key write access.

    Format is one `<key>:read|write` per line (wallet/api/cli/api_cli.cpp).
    """
    fd, path = tempfile.mkstemp(prefix=".api-", suffix=".acl", dir=str(STATE_DIR))
    os.close(fd)
    os.chmod(path, 0o600)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"{key}:write\n")
    _SECRET_FILES.add(path)
    return path


# Every transient secret file, so shutdown can guarantee removal. The 20-second
# daemon thread below is a convenience, not a guarantee: daemon threads are
# killed without running at interpreter exit, so Ctrl-C or a crash used to leave
# the password on disk indefinitely.
_SECRET_FILES = set()


def _purge_secret_files():
    for p in list(_SECRET_FILES):
        try:
            os.unlink(p)
        except OSError:
            pass
        _SECRET_FILES.discard(p)


atexit.register(_purge_secret_files)


def drop_secret_cfg(path, delay=0.0):
    """Delete a temp config, optionally after giving the child time to read it."""
    def _rm():
        if delay:
            time.sleep(delay)
        try:
            os.remove(path)
        except OSError:
            pass
    if delay:
        threading.Thread(target=_rm, daemon=True).start()
    else:
        _rm()


def redact(text, *secrets):
    """Strip secrets out of anything heading for a log or an API response."""
    if not text:
        return text
    for s in secrets:
        if s:
            text = text.replace(str(s), "***")
    return text


def build_injection_script(app_route=None):
    """The script every served HTML page gets, before any other script.

    Carries the session token and wraps fetch() so the token is attached once,
    centrally, instead of at each of the ~68 call sites — a call site that
    forgets it would simply stop working, and a future one cannot forget.
    """
    route_line = ""
    if app_route is not None:
        route_line = f"window.APP_ROUTE = {json.dumps(app_route)};\n"
    return f"""<script>
{route_line}window.BEAM_SESSION_TOKEN = {json.dumps(SESSION_TOKEN)};
(function () {{
    var _fetch = window.fetch.bind(window);
    window.fetch = function (input, init) {{
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        // Never leak the token to explorer APIs, price feeds or any other host.
        var sameOrigin = url.indexOf('://') === -1 || url.indexOf(window.location.origin) === 0;
        if (sameOrigin) {{
            init = init || {{}};
            var h = new Headers(init.headers || (typeof input === 'object' && input.headers) || {{}});
            h.set('X-Beam-Token', window.BEAM_SESSION_TOKEN);
            init = Object.assign({{}}, init, {{ headers: h }});
        }}
        return _fetch(input, init);
    }};
}})();
</script>
"""


class WalletProxyHandler(SimpleHTTPRequestHandler):
    """HTTP handler for static files, API proxy, and wallet management"""

    def serve_html_with_token(self, file_path):
        """Serve an HTML file with the token/fetch shim injected."""
        try:
            html = Path(file_path).read_text(encoding="utf-8")
        except OSError:
            self.send_error(404, "Not Found")
            return
        html = html.replace("</head>", build_injection_script() + "</head>", 1)
        encoded = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(encoded))
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self):
        # Nothing legitimate is cross-origin: the UI is served by this same
        # server. Answering a preflight at all would only help an attacker.
        self.send_error(405, "Method Not Allowed")

    def send_cors_headers(self):
        """Kept as a no-op so existing call sites stay valid.

        This used to send Access-Control-Allow-Origin: *, which let any page in
        the browser POST tx_send to the wallet proxy and read addr_list back.
        """
        return

    # ---- request origin enforcement -------------------------------------
    # The wallet API is unauthenticated by design (it trusts localhost), so the
    # only thing standing between a random web page and the user's funds is
    # whether we accept the request at all.

    def _allowed_hosts(self):
        return {f"127.0.0.1:{PORT}", f"localhost:{PORT}", f"[::1]:{PORT}"}

    def _check_request_origin(self):
        """Reject cross-origin and DNS-rebinding requests. True == allowed."""
        # Host header pins us to loopback names; blocks DNS rebinding, where a
        # hostname the attacker controls resolves to 127.0.0.1.
        host = (self.headers.get("Host") or "").strip().lower()
        if host and host not in self._allowed_hosts():
            self.send_json({"error": "Invalid Host header"}, 403)
            return False

        # A browser sets Origin on every cross-origin request, and on all
        # same-origin non-GET fetches. Absent means a top-level navigation.
        origin = (self.headers.get("Origin") or "").strip()
        if origin and origin.lower() not in {f"http://{h}" for h in self._allowed_hosts()}:
            print(f"[security] rejected cross-origin request from {origin} to {self.path}")
            self.send_json({"error": "Cross-origin requests are not allowed"}, 403)
            return False

        # Modern browsers label the initiator. cross-site can never be legitimate.
        if (self.headers.get("Sec-Fetch-Site") or "").lower() in ("cross-site", "same-site"):
            print(f"[security] rejected {self.headers.get('Sec-Fetch-Site')} request to {self.path}")
            self.send_json({"error": "Cross-site requests are not allowed"}, 403)
            return False

        return True

    def _check_session_token(self):
        """Require the token we injected into index.html on mutating calls.

        A cross-origin page cannot read the served HTML, so it cannot learn the
        token. This closes the class of attack rather than one instance of it.
        """
        if self.headers.get("X-Beam-Token") == SESSION_TOKEN:
            return True
        print(f"[security] missing/invalid session token for {self.path}")
        self.send_json({"error": "Missing or invalid session token"}, 403)
        return False

    def _guard(self, mutating=True):
        if not self._check_request_origin():
            return False
        if mutating and not self._check_session_token():
            return False
        return True

    def do_GET(self):
        # The Host check applies to EVERY route, not just /api/.
        #
        # It used to guard only /api/, so a DNS-rebinding attacker - a hostname
        # they control, re-resolved to 127.0.0.1 - could fetch "/" and read the
        # served HTML, which carries the per-run session token. Verified: a
        # request with Host: evil.attacker.com:9080 returned 200 and the token.
        #
        # The API's own Host check meant the stolen token could not then be
        # used, so this was defence in depth holding rather than a break. But
        # handing an attacker the token and betting on the next guard is not a
        # position worth keeping, and there is no reason to serve the app to a
        # hostname that is not ours.
        host = (self.headers.get("Host") or "").strip().lower()
        if host and host not in self._allowed_hosts():
            self.send_json({"error": "Invalid Host header"}, 403)
            return

        # GETs are reads, so no token is required (the page itself is a GET and
        # has none yet) — but cross-origin reads still leak addresses and
        # transaction history, so the origin check applies.
        if self.path.startswith("/api/") and not self._guard(mutating=False):
            return
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
        elif self.path in ('/favicon.png', '/favicon.svg', '/favicon.ico', '/manifest.json', '/icon-192.png', '/icon-512.png'):
            # Serve PWA assets from src/ directory
            self.path = "/src" + self.path
            super().do_GET()
        elif self.path.startswith("/css/") or self.path.startswith("/js/") or self.path.startswith("/images/") or self.path.startswith("/docs/") or self.path.startswith("/fonts/"):
            # Redirect CSS/JS/images/docs/fonts requests to src/ directory
            self.path = "/src" + self.path
            super().do_GET()
        elif self.path.startswith("/src/"):
            # Serve src files directly
            super().do_GET()
        elif self.path.startswith("/config/"):
            # Serve config files
            super().do_GET()
        elif self.path.startswith("/p2p/"):
            # The P2P iframe calls /api/* too, so it needs the same token.
            if self.path.split("?")[0].endswith(".html"):
                self.serve_html_with_token(
                    BASE_DIR / "src" / "p2p" / Path(self.path.split("?")[0]).name)
            else:
                self.path = "/src" + self.path
                super().do_GET()
        elif self.path.startswith("/explorer") or self.path in ["/", "/dashboard", "/assets", "/transactions", "/addresses", "/dex", "/p2p", "/airdrop", "/appstore", "/memeclash", "/fuddle", "/settings", "/donate"]:
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
                "memeclash": "memeclash",
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

        # Inject the route info and the session token. The token travels only
        # inside this HTML, which a cross-origin page cannot read.
        route_script = build_injection_script(app_route)
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
        if not self._guard(mutating=True):
            return
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
        if not self._guard(mutating=True):
            return
        if self.path.startswith("/api/wallet/"):
            # URL-decode before validating, or %2e%2e slips a traversal through.
            wallet_name = urllib.parse.unquote(self.path.split("/")[-1])
            if not WALLET_NAME_RE.match(wallet_name):
                self.send_json({"error": "Invalid wallet name"}, 400)
                return
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
            "version": APP_VERSION,
            "beam_version": platform_binary_info().get("beam_version"),
            "consensus": consensus_warning(),
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

    def _valid_wallet_name(self, name):
        """Reject a wallet name that is not a plain identifier.

        These names become path components under WALLETS_DIR. Only delete
        validated; unlock, create, restore, rescan, node switch and owner-key
        export each took whatever they were given. All six sit behind the CSRF
        and token guards, so this is defence in depth rather than an open door -
        but it costs nothing and there is no reason for a wallet name to contain
        a slash or a dot-dot.
        """
        if WALLET_NAME_RE.match(name or ""):
            return True
        self.send_json({"error": "Invalid wallet name"}, 400)
        return False

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
            if not self._valid_wallet_name(wallet_name):
                return
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
            if not self._valid_wallet_name(wallet_name):
                return
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
            if not self._valid_wallet_name(wallet_name):
                return
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
            if not self._valid_wallet_name(wallet_name):
                return
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
            if not self._valid_wallet_name(wallet_name):
                return
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
        """Update from git — developer checkouts only, never automatic.

        THREAT MODEL. An updater that fetches and runs remote code without the
        user saying yes is a supply-chain backdoor into every wallet that has it:
        whoever controls the source — including anyone who compromises the GitHub
        account or the repo — executes arbitrary code next to the user's keys. So:

          1. Never automatic. The user must approve each update explicitly.
          2. Never branch HEAD. A tagged, signed artifact only.
          3. Verify the signature before anything is written to disk, and refuse
             on mismatch instead of falling back.

        This endpoint satisfies none of (2) or (3) — it pulls whatever is on
        main — so it is restricted to git checkouts, requires an explicit opt-in,
        and requires the caller to pass confirm=true, which only a human clicking
        through a confirmation dialog can supply. Real updates go through the
        signed channel described in docs/PACKAGING.md.

        It is also behind the origin + session-token guard now; before that, any
        web page could have triggered a code update on the user's machine.
        """
        try:
            body = self.get_json_body() or {}

            # Check if this is a git installation
            git_dir = BASE_DIR / ".git"
            if not git_dir.exists():
                self.send_json({
                    "error": "This install does not update itself. Download the "
                             "latest signed release instead.",
                }, 400)
                return

            if os.environ.get("BEAM_ALLOW_GIT_UPDATE") != "1":
                self.send_json({
                    "error": "Self-update from branch HEAD is disabled. It would "
                             "run unreviewed, unsigned code next to your keys — if "
                             "the repository were ever compromised, that is a "
                             "direct path to your funds. Run `git pull` yourself "
                             "after reviewing the diff, or set "
                             "BEAM_ALLOW_GIT_UPDATE=1 on a development checkout.",
                }, 403)
                return

            # An explicit, per-update acknowledgement. Not a stored preference:
            # "I approved an update once" must never mean "apply all future ones".
            if body.get("confirm") is not True:
                self.send_json({
                    "error": "Update requires explicit confirmation.",
                    "requires_confirmation": True,
                    "warning": "This pulls and runs code from GitHub. Only proceed "
                               "if you have reviewed the changes.",
                }, 428)
                return

            print("\n[UPDATE] User-approved update starting...")

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
            if not self._valid_wallet_name(wallet_name):
                return
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
                        # Inject MemeClash shader for meme battle game
                        elif MEMECLASH_SHADER and MEMECLASH_CONTRACT_ID and MEMECLASH_CONTRACT_ID in args:
                            data["params"]["contract"] = MEMECLASH_SHADER
                            body = json.dumps(data).encode()
                except json.JSONDecodeError:
                    pass

            # Attach the ACL key. Done here, once, rather than at any call site,
            # so a future endpoint cannot forget it. It must never be sent to
            # the browser - that is the whole point.
            if body:
                try:
                    data = json.loads(body)
                    if isinstance(data, dict) and "method" in data:
                        data["key"] = WALLET_API_ACL_KEY
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

    # The page holds the session token and drives a signing API, so it must not
    # be framable and must not be able to reach hosts we did not choose.
    #
    # 'unsafe-inline' for scripts is unavoidable today: the UI carries ~287
    # inline onclick handlers. It still buys the important part - script-src
    # 'self' means an injected <script src> pointing at an attacker host is
    # refused, and connect-src pins where data can be sent. Removing the inline
    # handlers would let this be tightened properly.
    CSP = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        # Icons are vendored; data: covers the inline BEAM logo.
        "img-src 'self' data:; "
        "font-src 'self'; "
        # Explorer for the network tip, GitHub for the update check, Telegram
        # only if the user has configured their own bot in settings.
        "connect-src 'self' https://explorer.0xmx.net https://explorer-api.beamprivacy.com "
        "https://BeamSmart.net:8000 https://api.github.com https://api.telegram.org; "
        "frame-ancestors 'none'; "
        "base-uri 'none'; "
        "form-action 'none'; "
        "object-src 'none'"
    )

    def end_headers(self):
        if not hasattr(self, '_cors_sent'):
            self.send_cors_headers()
        if not hasattr(self, '_sec_headers_sent'):
            self._sec_headers_sent = True
            self.send_header("Content-Security-Policy", self.CSP)
            # frame-ancestors covers modern browsers; this covers the rest.
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    # ---- static asset compression and caching ---------------------------
    # The frontend ships ~2.3 MB of uncompressed JS and CSS on every load with
    # no cache headers, so it was re-fetched in full each time. These two
    # additions cost nothing and cut first paint by roughly 6x.

    COMPRESSIBLE = ('.js', '.css', '.html', '.json', '.svg', '.wasm', '.map')

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path) or not path.endswith(self.COMPRESSIBLE):
            return super().send_head()

        try:
            with open(path, 'rb') as f:
                body = f.read()
        except OSError:
            return super().send_head()

        ctype = self.guess_type(path)
        stat = os.stat(path)
        # Content changes on every rebuild, so key the validator on mtime+size.
        etag = f'W/"{int(stat.st_mtime)}-{stat.st_size}"'

        if self.headers.get('If-None-Match') == etag:
            self.send_response(304)
            self.send_header('ETag', etag)
            self.end_headers()
            return None

        encoding = None
        if 'gzip' in (self.headers.get('Accept-Encoding') or '') and len(body) > 1024:
            import gzip as _gzip
            gz = _gzip.compress(body, 6)
            if len(gz) < len(body):
                body, encoding = gz, 'gzip'

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('ETag', etag)
        # Assets are served from disk next to the app; revalidate rather than
        # cache hard, so an update is never masked by a stale copy.
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        if encoding:
            self.send_header('Content-Encoding', encoding)
            self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()

        import io
        return io.BytesIO(body)

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

    # Nothing here should be readable by other local accounts, and earlier
    # builds left plaintext passwords in the logs. Both are dealt with before
    # the server accepts a single request.
    for _d in (DATA_DIR, WALLETS_DIR, LOGS_DIR, STATE_DIR):
        _harden_dir(_d)
    sweep_leaked_secrets()

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
