#!/bin/bash
# BEAM Wallet v2 Test Runner
# Run all tests with one click

cd "$(dirname "$0")/.."

echo "=============================================="
echo "BEAM Light Wallet v2 - Test Suite"
echo "=============================================="

# Check if serve.py is running
if ! curl -s http://127.0.0.1:8080/ > /dev/null 2>&1; then
    echo "Starting server..."
    python3 serve.py 8080 &
    SERVER_PID=$!
    sleep 2
    echo "Server started (PID: $SERVER_PID)"
fi

# Install deps if needed
pip3 install -q selenium webdriver-manager 2>/dev/null

# Run tests
echo ""
echo "Running Selenium tests..."
echo ""

python3 tests/test_wallet_v2.py "$@"
RESULT=$?

# Cleanup
if [ ! -z "$SERVER_PID" ]; then
    echo ""
    echo "Stopping server..."
    kill $SERVER_PID 2>/dev/null
fi

exit $RESULT
