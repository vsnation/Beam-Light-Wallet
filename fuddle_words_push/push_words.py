#!/usr/bin/env python3
"""
Fuddle Word Pusher
==================
Pushes word lists to the Fuddle on-chain contract via wallet-api.
Sends up to 50 words per transaction (contract max).

Prerequisites:
  - serve.py running (port 9080) OR wallet-api running (port 10000)
  - Local node synced (for contract calls)
  - Wallet unlocked with admin key

Usage:
  python3 push_words.py                     # Push all words (4+5+6 letter)
  python3 push_words.py --length 5          # Push only 5-letter words
  python3 push_words.py --check             # View on-chain word counts
  python3 push_words.py --dry-run           # Preview without sending
  python3 push_words.py --skip 100          # Resume from word #100
  python3 push_words.py --batch-size 25     # Smaller batches
  python3 push_words.py --delay 10          # 10s between batches
"""

import os
import sys
import struct
import json
import time
import argparse
import urllib.request
import urllib.error

# ============================================================================
# Configuration
# ============================================================================

FUDDLE_CID = "28c52aef751ebe40d611660414dc355db7de4ae76bcc1dab5952537010735808"
MAX_BATCH = 50          # Contract limit (MAX_WORDS_PER_BATCH in contract.h)
DEFAULT_DELAY = 5       # Seconds between batches
WALLET_API = "http://127.0.0.1:10000/api/wallet"
SERVE_API = "http://127.0.0.1:9080/api/wallet"
TX_POLL_INTERVAL = 10   # Seconds between tx status checks
TX_POLL_TIMEOUT = 180   # Max seconds to wait for tx confirmation

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SHADER_PATH = os.path.join(SCRIPT_DIR, "..", "shaders", "fuddle_app.wasm")

WORD_FILES = {
    4: os.path.join(SCRIPT_DIR, "words_4.txt"),
    5: os.path.join(SCRIPT_DIR, "words_5.txt"),
    6: os.path.join(SCRIPT_DIR, "words_6.txt"),
}


# ============================================================================
# Helpers
# ============================================================================

def rpc_call(api_url, method, params=None):
    """Send JSON-RPC call to wallet-api."""
    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": method,
    }
    if params:
        payload["params"] = params

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        api_url,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as e:
        return {"error": {"message": str(e)}}
    except Exception as e:
        return {"error": {"message": str(e)}}


def detect_api():
    """Find a working API endpoint (serve.py or direct wallet-api)."""
    for url in [SERVE_API, WALLET_API]:
        try:
            resp = rpc_call(url, "wallet_status")
            if "result" in resp:
                return url
        except Exception:
            continue
    return None


def load_shader():
    """Load fuddle_app.wasm as byte array."""
    if not os.path.exists(SHADER_PATH):
        print(f"ERROR: Shader not found: {SHADER_PATH}")
        print(f"  Expected at: ../shaders/fuddle_app.wasm relative to this script")
        sys.exit(1)
    with open(SHADER_PATH, "rb") as f:
        return list(f.read())


def encode_word(word):
    """Encode word as uint32_t LE sequence (A=0, B=1, ..., Z=25)."""
    result = b""
    for c in word.upper():
        if "A" <= c <= "Z":
            result += struct.pack("<I", ord(c) - ord("A"))
        else:
            raise ValueError(f"Invalid character '{c}' in word '{word}'")
    return result


def encode_batch(words, length):
    """Encode a batch of words as hex string."""
    data = b""
    for word in words:
        if len(word) != length:
            raise ValueError(f"Word '{word}' is {len(word)} chars, expected {length}")
        data += encode_word(word)
    return data.hex()


def load_words(filepath):
    """Load words from file, one per line, uppercase, alpha only."""
    if not os.path.exists(filepath):
        return []
    words = []
    with open(filepath, "r") as f:
        for line in f:
            word = line.strip().upper()
            if word and word.isalpha():
                words.append(word)
    return words


# ============================================================================
# Contract interactions
# ============================================================================

def get_word_counts(api_url, shader):
    """Query on-chain word counts per length."""
    args = f"role=manager,action=view_word_counts,cid={FUDDLE_CID}"
    resp = rpc_call(api_url, "invoke_contract", {
        "contract": shader,
        "args": args,
    })
    result = resp.get("result", {})
    output = result.get("output", "")
    if not output:
        return None
    try:
        data = json.loads(output)
        return data.get("word_counts", {})
    except json.JSONDecodeError:
        return None


def push_batch(api_url, shader, words, length):
    """Push a batch of words to the contract. Returns (success, txid, error)."""
    hex_data = encode_batch(words, length)
    args = (
        f"role=manager,action=add_words,"
        f"cid={FUDDLE_CID},"
        f"length={length},"
        f"num_words={len(words)},"
        f"data={hex_data}"
    )

    resp = rpc_call(api_url, "invoke_contract", {
        "contract": shader,
        "args": args,
        "create_tx": True,
    })

    if "error" in resp:
        return False, None, resp["error"].get("message", "Unknown error")

    result = resp.get("result", {})
    txid = result.get("txid")

    if not txid:
        return False, None, f"No txid in response: {json.dumps(result)[:200]}"

    return True, txid, None


def wait_for_tx(api_url, txid, timeout=TX_POLL_TIMEOUT):
    """Poll tx status until completed or failed. Returns (success, status_string, fee)."""
    start = time.time()
    while time.time() - start < timeout:
        resp = rpc_call(api_url, "tx_list", {"count": 5})
        for tx in resp.get("result", []):
            if tx.get("txId") == txid:
                status = tx.get("status")
                status_str = tx.get("status_string", "unknown")
                fee = tx.get("fee", 0)
                if status == 3:  # completed
                    return True, status_str, fee
                elif status == 4:  # failed
                    reason = tx.get("failure_reason", "unknown")
                    return False, f"failed: {reason}", fee
                # status 0,1,2,5 = still in progress
                break
        time.sleep(TX_POLL_INTERVAL)
    return False, "timeout", 0


# ============================================================================
# Main
# ============================================================================

def cmd_check(api_url, shader):
    """Show on-chain word counts and compare with local files."""
    counts = get_word_counts(api_url, shader)
    if not counts:
        print("ERROR: Could not read word counts from contract")
        return

    print("\n  On-chain word counts:")
    print(f"  {'Length':<10} {'On-chain':<12} {'Local file':<12} {'Remaining'}")
    print(f"  {'------':<10} {'--------':<12} {'----------':<12} {'---------'}")

    for length in [4, 5, 6]:
        key = f"len{length}"
        on_chain = counts.get(key, 0)
        local_words = load_words(WORD_FILES.get(length, ""))
        local_count = len(local_words)
        remaining = max(0, local_count - on_chain)
        marker = " (done)" if remaining == 0 and local_count > 0 else ""
        print(f"  {length}-letter   {on_chain:<12} {local_count:<12} {remaining}{marker}")

    total_on = sum(counts.get(f"len{l}", 0) for l in [4, 5, 6])
    total_local = sum(len(load_words(WORD_FILES.get(l, ""))) for l in [4, 5, 6])
    print(f"\n  Total:     {total_on} on-chain / {total_local} in files")


def cmd_push(api_url, shader, args):
    """Push words to the contract."""
    lengths = [args.length] if args.length else [4, 5, 6]
    batch_size = min(args.batch_size, MAX_BATCH)
    delay = args.delay

    # Get current on-chain counts to auto-skip already-seeded words
    counts = get_word_counts(api_url, shader) or {}

    total_pushed = 0
    total_failed = 0
    total_skipped = 0
    total_fee = 0

    for length in lengths:
        words = load_words(WORD_FILES.get(length, ""))
        if not words:
            print(f"\n  SKIP: No words file for {length}-letter words")
            continue

        # Auto-skip already seeded words
        on_chain = counts.get(f"len{length}", 0)
        skip = max(args.skip, on_chain)

        if skip >= len(words):
            print(f"\n  {length}-letter: all {len(words)} words already on-chain ({on_chain}), skipping")
            total_skipped += len(words)
            continue

        remaining = words[skip:]
        print(f"\n{'=' * 60}")
        print(f"  {length}-letter words: {len(remaining)} to push (skipping first {skip})")
        print(f"  Batch size: {batch_size}, delay: {delay}s")
        print(f"{'=' * 60}")

        batches = [remaining[i:i + batch_size] for i in range(0, len(remaining), batch_size)]

        for batch_idx, batch in enumerate(batches):
            word_offset = skip + batch_idx * batch_size
            first = batch[0]
            last = batch[-1]
            print(f"\n  Batch {batch_idx + 1}/{len(batches)}: "
                  f"words [{word_offset}..{word_offset + len(batch) - 1}] "
                  f"({first}..{last})")

            if args.dry_run:
                print(f"    [DRY RUN] Would push {len(batch)} words")
                total_pushed += len(batch)
                continue

            ok, txid, err = push_batch(api_url, shader, batch, length)
            if not ok:
                print(f"    FAILED to submit: {err}")
                if "Not enough" in str(err):
                    print(f"    UTXO contention - waiting 65s before retry...")
                    time.sleep(65)
                    ok, txid, err = push_batch(api_url, shader, batch, length)
                    if not ok:
                        print(f"    RETRY FAILED: {err}")
                        total_failed += len(batch)
                        print(f"    Resume with: --length {length} --skip {word_offset}")
                        continue

                total_failed += len(batch)
                print(f"    Resume with: --length {length} --skip {word_offset}")
                continue

            print(f"    TX: {txid}  Waiting for confirmation...")

            success, status, fee = wait_for_tx(api_url, txid)
            fee_beam = fee / 100_000_000
            total_fee += fee

            if success:
                total_pushed += len(batch)
                print(f"    OK  fee={fee_beam:.4f} BEAM  (total pushed: {total_pushed})")
            else:
                total_failed += len(batch)
                print(f"    FAILED: {status}  fee={fee_beam:.4f} BEAM")
                print(f"    Resume with: --length {length} --skip {word_offset}")

            # Wait between batches
            if batch_idx < len(batches) - 1:
                print(f"    Waiting {delay}s...")
                time.sleep(delay)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"  DONE")
    print(f"  Pushed:  {total_pushed} words")
    if total_skipped:
        print(f"  Skipped: {total_skipped} (already on-chain)")
    if total_failed:
        print(f"  Failed:  {total_failed}")
    if total_fee:
        print(f"  Fees:    {total_fee / 100_000_000:.4f} BEAM")
    print(f"{'=' * 60}")

    # Show final counts
    if not args.dry_run and total_pushed > 0:
        print("\n  Verifying final on-chain counts...")
        time.sleep(2)
        cmd_check(api_url, shader)


def main():
    parser = argparse.ArgumentParser(
        description="Push word lists to Fuddle on-chain contract",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --check              View on-chain vs local word counts
  %(prog)s                      Push all remaining words
  %(prog)s --length 5           Push only 5-letter words
  %(prog)s --dry-run            Preview what would be pushed
  %(prog)s --skip 200           Skip first 200 words (manual resume)
  %(prog)s --batch-size 25      Use smaller batches (default: 50)
  %(prog)s --delay 10           Wait 10s between batches (default: 5)
        """,
    )
    parser.add_argument("--check", action="store_true",
                        help="View on-chain word counts and exit")
    parser.add_argument("--length", type=int, choices=[4, 5, 6], default=0,
                        help="Word length to push (0 = all)")
    parser.add_argument("--batch-size", type=int, default=MAX_BATCH,
                        help=f"Words per transaction (max {MAX_BATCH})")
    parser.add_argument("--skip", type=int, default=0,
                        help="Skip first N words (manual resume)")
    parser.add_argument("--delay", type=int, default=DEFAULT_DELAY,
                        help="Seconds between batches")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done, don't send transactions")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="Skip confirmation prompt")
    parser.add_argument("--api", type=str, default="",
                        help="Wallet API URL (auto-detected if not set)")
    args = parser.parse_args()

    # Detect API
    if args.api:
        api_url = args.api
    else:
        print("  Detecting wallet API...")
        api_url = detect_api()

    if not api_url:
        print("\n  ERROR: Cannot connect to wallet-api.")
        print("  Make sure one of these is running:")
        print(f"    - serve.py (http://127.0.0.1:9080)")
        print(f"    - wallet-api (http://127.0.0.1:10000)")
        print("  And the wallet is unlocked with admin key.")
        sys.exit(1)

    print(f"  Connected: {api_url}")

    # Load shader
    shader = load_shader()
    print(f"  Shader: {len(shader)} bytes")

    if args.check:
        cmd_check(api_url, shader)
        return

    # Confirm before pushing
    if not args.dry_run:
        print(f"\n  Contract: {FUDDLE_CID[:16]}...")
        cmd_check(api_url, shader)
        if not args.yes:
            print()
            answer = input("  Proceed with push? [y/N] ").strip().lower()
            if answer != "y":
                print("  Aborted.")
                return

    cmd_push(api_url, shader, args)


if __name__ == "__main__":
    main()
