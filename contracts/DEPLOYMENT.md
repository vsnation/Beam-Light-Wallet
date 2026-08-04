# BEAM Smart Contract Deployment Guide

This guide documents how to deploy BEAM smart contracts (shaders) to the blockchain.

## Prerequisites

### 1. BEAM Binaries
Download and extract BEAM binaries for your platform:
- `beam-wallet` - CLI wallet for contract deployment
- `wallet-api` - JSON-RPC API server (optional, for web integration)
- `beam-node` - Local node (required for contract deployment)

**Version:** 7.5.13882

### 2. Wallet Setup
Create or restore a wallet with sufficient BEAM balance for deployment fees (~0.011 BEAM per contract).

### 3. Local Node (Required for Deployment)
**IMPORTANT:** Contract deployment requires a local node. Public nodes do not support contract transactions.

Start local node:
```bash
./binaries/macos/beam-node \
    --port=10005 \
    --storage=node_data/node.db \
    --fast_sync=1 \
    --peer=eu-node01.mainnet.beam.mw:8100 \
    --peer=us-node01.mainnet.beam.mw:8100 \
    --owner_key=YOUR_OWNER_KEY \
    --pass=YOUR_PASSWORD
```

Export owner key from wallet:
```bash
./binaries/macos/beam-wallet export_owner_key \
    --wallet_path=wallets/my_wallet/wallet.db \
    --pass=YOUR_PASSWORD
```

---

## Contract Deployment

### Method 1: Using beam-wallet CLI (Recommended)

**Command Format:**
```bash
./binaries/macos/beam-wallet shader \
    --wallet_path=<path_to_wallet.db> \
    --pass=<wallet_password> \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=<path_to_app.wasm> \
    --shader_args="role=manager,action=create" \
    --shader_contract_file=<path_to_contract.wasm>
```

**Example - Deploy P2P Escrow Contract:**
```bash
./binaries/macos/beam-wallet shader \
    --wallet_path=wallets/test_wallet/wallet.db \
    --pass=REDACTED_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=shaders/p2p_escrow_app.wasm \
    --shader_args="role=manager,action=create" \
    --shader_contract_file=shaders/p2p_escrow_contract.wasm
```

**Auto-confirm deployment (non-interactive):**
```bash
echo "y" | ./binaries/macos/beam-wallet shader \
    --wallet_path=wallets/test_wallet/wallet.db \
    --pass=REDACTED_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=shaders/p2p_escrow_app.wasm \
    --shader_args="role=manager,action=create" \
    --shader_contract_file=shaders/p2p_escrow_contract.wasm
```

**Expected Output:**
```
Executing shader...
Shader output: {}
Creating new contract invocation tx on behalf of the shader
Contract ID: 95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf
    Comment: Deploy P2P Escrow contract
    Total fee: 0.011 BEAM
Proceed? (y/n)
```

### Method 2: Using wallet-api JSON-RPC

**Start wallet-api:**
```bash
./binaries/macos/wallet-api \
    --wallet_path=wallets/test_wallet/wallet.db \
    --pass=REDACTED_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --port=10000 \
    --use_http=1 \
    --enable_assets
```

**Prepare Contract Bytes (Python):**
```python
import json

# Read WASM files
with open('shaders/p2p_escrow_app.wasm', 'rb') as f:
    app_bytes = list(f.read())

with open('shaders/p2p_escrow_contract.wasm', 'rb') as f:
    contract_bytes = list(f.read())

# Convert contract to hex string
contract_hex = ''.join(f'{b:02x}' for b in contract_bytes)

# Build args
args = f"role=manager,action=create,contract={contract_hex}"

# Create payload
payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "invoke_contract",
    "params": {
        "contract": app_bytes,
        "create_tx": True,
        "args": args
    }
}

# Save to file
with open('/tmp/deploy.json', 'w') as f:
    json.dump(payload, f)
```

**Deploy via curl:**
```bash
curl -X POST http://127.0.0.1:10000/api/wallet \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/deploy.json
```

---

## Key Parameters

| Parameter | Description |
|-----------|-------------|
| `--wallet_path` | Path to wallet.db file |
| `--pass` | Wallet password |
| `--node_addr` | Node address (127.0.0.1:10005 for local) |
| `--shader_app_file` | Path to app shader WASM |
| `--shader_contract_file` | Path to contract shader WASM |
| `--shader_args` | Action parameters |

## Shader Args Format

The `shader_args` parameter uses comma-separated key=value pairs:
```
role=manager,action=create
```

Common actions:
- `role=manager,action=create` - Deploy new contract
- `role=user,action=view,cid=CONTRACT_ID` - View contract state

---

## Deployed Contracts

### P2P Escrow Contract

**Contract ID:** `95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf`

**Deployment Date:** 2026-01-28

**Block Height:** 3708123

**Fee:** 0.011 BEAM

**Features:**
- Trader registration with trust scores
- Order creation (buy/sell)
- Escrow deposit management
- Payment confirmation flow
- Dispute resolution with voting
- Staking rewards (0.5% fee distribution)

---

## Troubleshooting

### "database is locked"
Stop any running wallet-api before using beam-wallet CLI:
```bash
pkill -f wallet-api
```

### "Failed to register transaction"
- Ensure you're connected to a local node, not a public node
- Public nodes don't support contract deployment
- Check node sync status

### "Connection error"
- Verify local node is running: `ps aux | grep beam-node`
- Check node port: `lsof -i :10005`

### "Stem-Tx invalid"
- Contract may have compilation errors
- Verify WASM files were compiled correctly
- Check contract signature requirements

### "invalid action" / "role not specified"
- Check app shader source for supported actions
- Most contracts use `role=manager,action=create` for deployment

---

## Verifying Deployment

### Check Transaction Status
```bash
curl -s http://127.0.0.1:10000/api/wallet \
    -d '{"jsonrpc":"2.0","id":1,"method":"tx_status","params":{"txId":"YOUR_TX_ID"}}'
```

### Query Contract State
```bash
./binaries/macos/beam-wallet shader \
    --wallet_path=wallets/test_wallet/wallet.db \
    --pass=REDACTED_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=shaders/p2p_escrow_app.wasm \
    --shader_args="role=user,action=view,cid=95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf"
```

### View on Explorer
Visit: `https://explorer.beam.mw/contract/CONTRACT_ID`

---

## Complete Deployment Script

```bash
#!/bin/bash

# Configuration
WALLET_PATH="wallets/my_wallet/wallet.db"
PASSWORD="MySecurePassword123"
NODE_ADDR="127.0.0.1:10005"
APP_SHADER="shaders/p2p_escrow_app.wasm"
CONTRACT_SHADER="shaders/p2p_escrow_contract.wasm"

# Stop any existing wallet-api
pkill -f wallet-api 2>/dev/null
sleep 2

# Check if node is running
if ! lsof -i :10005 > /dev/null 2>&1; then
    echo "ERROR: Local node not running on port 10005"
    echo "Start node first with: ./binaries/macos/beam-node --port=10005 ..."
    exit 1
fi

# Deploy contract
echo "Deploying contract..."
echo "y" | ./binaries/macos/beam-wallet shader \
    --wallet_path="$WALLET_PATH" \
    --pass="$PASSWORD" \
    --node_addr="$NODE_ADDR" \
    --shader_app_file="$APP_SHADER" \
    --shader_args="role=manager,action=create" \
    --shader_contract_file="$CONTRACT_SHADER" 2>&1 | tee deploy.log

# Extract Contract ID
CONTRACT_ID=$(grep "Contract ID:" deploy.log | awk '{print $3}')
if [ -n "$CONTRACT_ID" ]; then
    echo ""
    echo "================================"
    echo "Contract deployed successfully!"
    echo "Contract ID: $CONTRACT_ID"
    echo "================================"
else
    echo "ERROR: Failed to extract Contract ID"
    exit 1
fi
```

---

## Security Notes

1. **Never share your wallet password** in scripts or logs
2. **Backup your seed phrase** before deployment
3. **Test on testnet first** before mainnet deployment
4. **Audit contracts** before deploying to mainnet
5. **Store Contract ID** securely after deployment

---

## References

- [BEAM Shader SDK](https://github.com/BeamMW/shader-sdk)
- [BEAM Documentation](https://documentation.beam.mw)
- [How to Develop Shaders](./How_to_develop_shaders.md)
- [P2P Escrow Contract Source](./p2p_escrow/)
