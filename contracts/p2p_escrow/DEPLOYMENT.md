# P2P Escrow Contract - Deployment Guide

## Current Deployment

| Field | Value |
|-------|-------|
| **Contract ID** | `7c70746be5247487871c1829fb9a1415f0fec71af6d61151035cd788e138f39f` |
| **Deployed** | 2026-01-29 12:04:44 UTC |
| **Block Height** | 3709167 |
| **Version** | 1 |
| **Fee** | 0.011 BEAM |

## Quick Deploy (One Command)

```bash
cd /Users/anastasiasmirnova/Desktop/Beam/LightWallet/contracts/p2p_escrow
./deploy.sh [wallet_name] [password] [node_address]

# Example with defaults:
./deploy.sh test_wallet REDACTED_PASSWORD 127.0.0.1:10005
```

The script will:
1. Verify LLVM/clang with wasm32 support
2. Compile `contract.wasm` and `app.wasm`
3. Verify WASM exports (Ctor, Dtor, Method_0, Method_1)
4. Deploy using `beam-wallet` CLI
5. Save contract ID to `shaders/p2p_escrow_contract_id.txt`

## Prerequisites

### 1. LLVM/Clang with WASM Support

```bash
# macOS
brew install llvm

# Verify wasm32 target
/opt/homebrew/opt/llvm/bin/clang --print-targets | grep wasm32
```

### 2. BEAM Repository (for shader includes)

```bash
cd /Users/anastasiasmirnova/Desktop/Beam
git clone https://github.com/BeamMW/beam.git beam-repo
```

### 3. Local Node Running

Contract deployment requires a **local node**. Public nodes don't support contract deployment.

```bash
# Start local node (if not already running)
cd /Users/anastasiasmirnova/Desktop/Beam/LightWallet
./launch.sh  # Choose "Start local node"
```

### 4. Wallet with BEAM Balance

~0.012 BEAM required for deployment fee.

## Manual Deployment Steps

### Step 1: Compile Shaders

```bash
cd /Users/anastasiasmirnova/Desktop/Beam/LightWallet/contracts/p2p_escrow

# Compile contract shader
/opt/homebrew/opt/llvm/bin/clang -O3 \
    --target=wasm32 \
    -I/Users/anastasiasmirnova/Desktop/Beam/beam-repo/bvm/Shaders \
    -Wl,--export-dynamic,--no-entry,--allow-undefined \
    -nostdlib \
    -o contract.wasm \
    contract.cpp

# Compile app shader
/opt/homebrew/opt/llvm/bin/clang -O3 \
    --target=wasm32 \
    -I/Users/anastasiasmirnova/Desktop/Beam/beam-repo/bvm/Shaders \
    -Wl,--export-dynamic,--no-entry,--allow-undefined \
    -nostdlib \
    -o app.wasm \
    app.cpp
```

### Step 2: Verify WASM Exports

```bash
# Check contract exports (must have Ctor, Dtor, Method_2-19)
wasm-objdump -x contract.wasm | grep Export

# Check app exports (must have Method_0, Method_1)
wasm-objdump -x app.wasm | grep Export
```

Expected contract exports:
- `Ctor` - Constructor
- `Dtor` - Destructor
- `Method_2` through `Method_19` - Contract methods

Expected app exports:
- `Method_0` - Schema
- `Method_1` - Dispatcher

### Step 3: Stop wallet-api

```bash
pkill -f wallet-api
```

### Step 4: Deploy with beam-wallet CLI

```bash
echo "y" | /Users/anastasiasmirnova/Desktop/Beam/LightWallet/binaries/macos/beam-wallet \
    --command=shader \
    --wallet_path=/Users/anastasiasmirnova/Desktop/Beam/LightWallet/wallets/test_wallet/wallet.db \
    --pass=REDACTED_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=app.wasm \
    --shader_contract_file=contract.wasm \
    --shader_args="role=manager,action=create,min_escrow_stake=100000000"
```

Output will show:
```
Contract ID: 7c70746be5247487871c1829fb9a1415f0fec71af6d61151035cd788e138f39f
    Comment: Deploy P2P Escrow contract
    Total fee: 0.011 BEAM
```

## Contract Configuration

The contract is deployed with these settings (defined in `contract.h`):

| Setting | Value | Description |
|---------|-------|-------------|
| `MIN_ESCROW_STAKE` | 1 FOMO | Minimum stake to become escrow |
| `LOCK_PERIOD` | 5 minutes | Escrow stake lock period |
| `TRADE_FEE_BPS` | 50 (0.5%) | Fee per completed trade |
| `DEFAULT_DEPOSIT_PCT` | 10% | Security deposit |
| `PAYMENT_TIMEOUT` | 5 minutes | Time for buyer to pay |
| `CONFIRM_TIMEOUT` | 10 minutes | Time for seller to confirm |
| `DISPUTE_TIMEOUT` | 15 minutes | Time to resolve dispute |

**Note:** These are TEST values. For production, update `contract.h` and redeploy.

## Interacting with the Contract

### View Contract Settings

```bash
/Users/anastasiasmirnova/Desktop/Beam/LightWallet/binaries/macos/beam-wallet \
    --command=shader \
    --wallet_path=/Users/anastasiasmirnova/Desktop/Beam/LightWallet/wallets/test_wallet/wallet.db \
    --pass=REDACTED_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=app.wasm \
    --shader_args="role=manager,action=view,cid=7c70746be5247487871c1829fb9a1415f0fec71af6d61151035cd788e138f39f"
```

### Register as Trader

```bash
--shader_args="role=user,action=register_trader,cid=CONTRACT_ID"
```

### Create Sell Order

```bash
--shader_args="role=user,action=create_order,cid=CONTRACT_ID,asset_id=174,amount=1000000000,price=100,currency=840,min_limit=100000000,max_limit=10000000000,payment_methods=1,side=0"
```

### View Orders

```bash
--shader_args="role=user,action=view_orders,cid=CONTRACT_ID,asset_id=174,side=255,skip=0,limit=100"
```

## Upgrading the Contract

This contract supports upgradeability. To deploy a new version:

### Step 1: Deploy New Version

```bash
./deploy.sh test_wallet REDACTED_PASSWORD
# Note the new CONTRACT_ID
```

### Step 2: Mark Old Contract as Upgraded

```bash
--shader_args="role=manager,action=upgrade,cid=OLD_CONTRACT_ID,new_cid=NEW_CONTRACT_ID"
```

After upgrade, calling `view` on the old contract will show:
```json
{
    "upgraded_to": "NEW_CONTRACT_ID",
    "status": "UPGRADED - use new contract"
}
```

## Troubleshooting

### "Failed to register transaction"

- **Cause:** Using public node instead of local node
- **Fix:** Start local node and use `--node_addr=127.0.0.1:10005`

### "database is locked"

- **Cause:** wallet-api is running and holding the lock
- **Fix:** `pkill -f wallet-api`

### "Ctor NOT FOUND"

- **Cause:** Compilation error or missing includes
- **Fix:** Verify BEAM repo path and recompile

### Transaction stuck as "pending"

- **Cause:** Node not fully synced
- **Fix:** Wait for sync or check node logs

## File Locations

| File | Path |
|------|------|
| Contract source | `contracts/p2p_escrow/contract.cpp` |
| App source | `contracts/p2p_escrow/app.cpp` |
| Header | `contracts/p2p_escrow/contract.h` |
| Compiled contract | `shaders/p2p_escrow_contract.wasm` |
| Compiled app | `shaders/p2p_escrow_app.wasm` |
| Contract ID | `shaders/p2p_escrow_contract_id.txt` |
| Deployment info | `shaders/p2p_escrow_deployment.json` |
| Deploy script | `contracts/p2p_escrow/deploy.sh` |

## Contract Methods

| Method | ID | Role | Description |
|--------|----|----|-------------|
| Ctor | 0 | deploy | Create contract |
| Dtor | 1 | manager | Destroy contract |
| register_trader | 2 | user | Register as trader |
| create_order | 3 | user | Create sell/buy order |
| cancel_order | 4 | user | Cancel open order |
| accept_order | 5 | user | Accept order, start trade |
| mark_payment_sent | 6 | user | Buyer marks fiat sent |
| confirm_payment | 7 | user | Seller confirms, releases funds |
| open_dispute | 8 | user | Open dispute |
| escrow_vote | 9 | user | Escrow votes on dispute |
| submit_feedback | 10 | user | Submit trade feedback |
| stake_escrow | 11 | user | Stake FOMO to become escrow |
| unstake_escrow | 12 | user | Unstake after lock period |
| claim_rewards | 13 | user | Claim escrow rewards |
| withdraw_fees | 14 | manager | Withdraw accumulated fees |
| assign_escrows | 15 | manager | Assign escrows to dispute |
| update_settings | 16 | manager | Update contract settings |
| add_manager | 17 | manager | Add new manager (owner only) |
| remove_manager | 18 | manager | Remove manager (owner only) |
| upgrade | 19 | manager | Mark contract as upgraded |
