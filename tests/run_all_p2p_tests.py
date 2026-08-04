#!/usr/bin/env python3
"""
Run all P2P tests in sequence
"""

import subprocess
import sys
import os

os.chdir("/Users/anastasiasmirnova/Desktop/Beam/LightWallet/tests")

tests = [
    ("Full Trade Flow", "full_trade_flow.py"),
    ("Order Management", "test_order_management.py"),
    ("Loading Animation", "test_loading_animation.py"),
]

results = []

print("="*60)
print("P2P TEST SUITE")
print("="*60)

for name, script in tests:
    print(f"\n{'='*60}")
    print(f"Running: {name}")
    print("="*60)

    try:
        result = subprocess.run(
            [sys.executable, script],
            capture_output=False,
            timeout=180
        )
        passed = result.returncode == 0
        results.append((name, "PASS" if passed else "FAIL"))
    except subprocess.TimeoutExpired:
        results.append((name, "TIMEOUT"))
    except Exception as e:
        results.append((name, f"ERROR: {e}"))

print("\n" + "="*60)
print("FINAL RESULTS")
print("="*60)

all_passed = True
for name, status in results:
    icon = "✓" if status == "PASS" else "✗"
    print(f"{icon} {name}: {status}")
    if status != "PASS":
        all_passed = False

print("\n" + "="*60)
if all_passed:
    print("ALL TESTS PASSED!")
else:
    print("SOME TESTS FAILED")
print("="*60)
