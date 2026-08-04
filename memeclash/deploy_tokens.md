# MemeClash Token Deployment Guide

## Pre-Requisites

- Local node running and synced (contract deployment requires local node)
- Wallet with ~100,225 BEAM
- wallet-api running on port 10000

### Ensure wallet-api is running

```bash
cd /Users/anastasiasmirnova/Desktop/Beam/LightWallet

# Start wallet-api (substitute your wallet name and password)
./binaries/macos/wallet-api \
    --wallet_path="wallets/YOUR_WALLET/wallet.db" \
    --pass="YOUR_PASSWORD" \
    --node_addr=127.0.0.1:10005 \
    --port=10000 \
    --use_http=1 \
    --enable_assets
```

---

## Step 1: Create $CHAD Token (60 BEAM)

**Minter CID:** `295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868`

```bash
# Read minter shader
MINTER_SHADER=$(python3 -c "
import json
with open('shaders/minter_app.wasm', 'rb') as f:
    print(json.dumps(list(f.read())))
")

# Create CHAD token
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MINTER_SHADER"',
        "create_tx": true,
        "args": "role=user,action=create_token,cid=295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868,metadata=STD:SCH_VER=1;N=Chad;SN=Chad;UN=CHAD;NTHUN=groth;NTH_RATIO=100000000;OPT_SHORT_DESC=MemeClash Battle Token - Team Chad;OPT_ICON_URL=https://ipfs.io/ipfs/QmYMksnyN1Cb32jMFkQcjxao3i7XSPL1dWJuHrGXcTr5cx;OPT_COLOR=#25c2a0,limit=100000000000000000"
    }
}' | python3 -m json.tool

# SAVE the txId! Wait for it to confirm (~1 min)
# Then check your asset list to find the NEW asset ID
sleep 60

curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "assets_list",
    "params": {"refresh": true}
}' | python3 -m json.tool
```

**Record:** NEW_CHAD_AID = ___

---

## Step 2: Create $GIGA Token (60 BEAM)

```bash
# Create GIGA token
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MINTER_SHADER"',
        "create_tx": true,
        "args": "role=user,action=create_token,cid=295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868,metadata=STD:SCH_VER=1;N=GigaChad;SN=Giga;UN=GIGA;NTHUN=groth;NTH_RATIO=100000000;OPT_SHORT_DESC=MemeClash Battle Token - Team GigaChad;OPT_ICON_URL=https://ipfs.io/ipfs/QmZrekbbMSqYNjbkyKM9Ar3k7f6RUW2zUmNv9cxGz8DZvJ;OPT_COLOR=#a855f7,limit=100000000000000000"
    }
}' | python3 -m json.tool

# Wait and check assets_list again
sleep 60

curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "assets_list",
    "params": {"refresh": true}
}' | python3 -m json.tool
```

**Record:** NEW_GIGA_AID = ___

---

## Step 3: Mint (Withdraw) Full Supply

Wait 3-5 seconds between transactions to avoid UTXO conflicts.

```bash
# Mint 1B CHAD (100000000000000000 groth = 1,000,000,000 × 1e8)
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MINTER_SHADER"',
        "create_tx": true,
        "args": "role=user,action=withdraw,cid=295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868,aid=NEW_CHAD_AID,value=100000000000000000"
    }
}'

sleep 5

# Mint 1B GIGA
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MINTER_SHADER"',
        "create_tx": true,
        "args": "role=user,action=withdraw,cid=295fe749dc12c55213d1bd16ced174dc8780c020f59cb17749e900bb0c15d868,aid=NEW_GIGA_AID,value=100000000000000000"
    }
}'

# Wait for both to confirm
sleep 60

# Verify balances
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 7,
    "method": "wallet_status",
    "params": {}
}' | python3 -m json.tool
```

---

## Step 4: Create DEX Pools (50,000 BEAM each)

**DEX CID:** `729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf`

```bash
# Read DEX shader
DEX_SHADER=$(python3 -c "
import json
with open('shaders/amm_app.wasm', 'rb') as f:
    print(json.dumps(list(f.read())))
")

# Create CHAD/BEAM pool
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 8,
    "method": "invoke_contract",
    "params": {
        "contract": '"$DEX_SHADER"',
        "create_tx": true,
        "args": "action=pool_create,cid=729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf,aid1=0,aid2=NEW_CHAD_AID,kind=2"
    }
}'

sleep 5

# Create GIGA/BEAM pool
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 9,
    "method": "invoke_contract",
    "params": {
        "contract": '"$DEX_SHADER"',
        "create_tx": true,
        "args": "action=pool_create,cid=729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf,aid1=0,aid2=NEW_GIGA_AID,kind=2"
    }
}'

# Wait for pool creation to confirm
sleep 60
```

```bash
# Add liquidity to CHAD/BEAM pool: 50,000 BEAM + 350M CHAD
# 50,000 BEAM = 5,000,000,000,000 groth
# 350M CHAD  = 35,000,000,000,000,000 groth
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 10,
    "method": "invoke_contract",
    "params": {
        "contract": '"$DEX_SHADER"',
        "create_tx": true,
        "args": "action=pool_add_liquidity,cid=729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf,aid1=0,aid2=NEW_CHAD_AID,kind=2,val1=5000000000000,val2=35000000000000000"
    }
}'

sleep 5

# Add liquidity to GIGA/BEAM pool: 50,000 BEAM + 350M GIGA
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 11,
    "method": "invoke_contract",
    "params": {
        "contract": '"$DEX_SHADER"',
        "create_tx": true,
        "args": "action=pool_add_liquidity,cid=729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf,aid1=0,aid2=NEW_GIGA_AID,kind=2,val1=5000000000000,val2=35000000000000000"
    }
}'

# Wait for LP to confirm
sleep 60

# Verify pools
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 12,
    "method": "invoke_contract",
    "params": {
        "contract": '"$DEX_SHADER"',
        "create_tx": false,
        "args": "action=pools_view,cid=729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf"
    }
}' | python3 -m json.tool
```

**Record:** CHAD_LP_TOKEN_AID = ___, GIGA_LP_TOKEN_AID = ___

---

## Step 5: Burn 45% to BlackHole (450M each)

**BlackHole CID:** `5ab408982b148210e88f180114f10222a2235eafeede0a3a224fda0e523e17b7`

```bash
# Read BlackHole shader (if you have it), or use raw invoke
# 450M = 45,000,000,000,000,000 groth

# Burn 450M CHAD to BlackHole
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 13,
    "method": "invoke_contract",
    "params": {
        "create_tx": true,
        "args": "role=user,action=deposit,cid=5ab408982b148210e88f180114f10222a2235eafeede0a3a224fda0e523e17b7,aid=NEW_CHAD_AID,amount=45000000000000000"
    }
}'

sleep 5

# Burn 450M GIGA to BlackHole
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 14,
    "method": "invoke_contract",
    "params": {
        "create_tx": true,
        "args": "role=user,action=deposit,cid=5ab408982b148210e88f180114f10222a2235eafeede0a3a224fda0e523e17b7,aid=NEW_GIGA_AID,amount=45000000000000000"
    }
}'

sleep 60

# Verify burns on explorer
echo "Check https://explorer.0xmx.net/api/contract?id=5ab408982b148210e88f180114f10222a2235eafeede0a3a224fda0e523e17b7"
```

---

## Step 6: Deploy New MemeClash Contract (v9)

```bash
# Get admin public key from wallet
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 15,
    "method": "addr_list",
    "params": {"own": true}
}' | python3 -m json.tool
# Use public key from one of your addresses

# Deploy via beam-wallet CLI (stop wallet-api first!)
pkill -f wallet-api
sleep 3

# Deploy new MemeClash contract with new token AIDs
echo "y" <<< "./binaries/macos/beam-wallet shader \
    --wallet_path=wallets/YOUR_WALLET/wallet.db \
    --pass=YOUR_PASSWORD \
    --node_addr=127.0.0.1:10005 \
    --shader_app_file=shaders/memeclash_app.wasm \
    --shader_args='role=manager,action=create,owner=YOUR_ADMIN_PK,token0=NEW_CHAD_AID,token1=NEW_GIGA_AID,fomo_asset_id=174,dex_cid=729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf,blackhole_cid=5ab408982b148210e88f180114f10222a2235eafeede0a3a224fda0e523e17b7,pool_kind=2,round_duration=1440,trade_fee_bps=500' \
    --shader_contract_file=shaders/memeclash_contract.wasm" <<< "y"
```

**Important:** Use `<<< "y"` not `echo "y" |` (positional options error).

**Record:** NEW_MEMECLASH_CID = ___

```bash
# Restart wallet-api
./binaries/macos/wallet-api \
    --wallet_path="wallets/YOUR_WALLET/wallet.db" \
    --pass="YOUR_PASSWORD" \
    --node_addr=127.0.0.1:10005 \
    --port=10000 \
    --use_http=1 \
    --enable_assets
```

---

## Step 7: Seed Initial Treasury (First Batch: 3M each)

Don't deposit all 100M at once. Start with 3M per team (0.3% of supply) — enough for first round burns.

```bash
# Read MemeClash shader
MC_SHADER=$(python3 -c "
import json
with open('shaders/memeclash_app.wasm', 'rb') as f:
    print(json.dumps(list(f.read())))
")

# Deposit 3M CHAD to treasury (team 0)
# 3,000,000 tokens = 300,000,000,000,000 groth
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 16,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MC_SHADER"',
        "create_tx": true,
        "args": "role=user,action=deposit_tokens,cid=NEW_MEMECLASH_CID,team=0,amount=300000000000000"
    }
}'

sleep 5

# Deposit 3M GIGA to treasury (team 1)
curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 17,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MC_SHADER"',
        "create_tx": true,
        "args": "role=user,action=deposit_tokens,cid=NEW_MEMECLASH_CID,team=1,amount=300000000000000"
    }
}'

# Verify contract state
sleep 30

curl -s http://127.0.0.1:10000/api/wallet -d '{
    "jsonrpc": "2.0",
    "id": 18,
    "method": "invoke_contract",
    "params": {
        "contract": '"$MC_SHADER"',
        "create_tx": false,
        "args": "role=manager,action=view,cid=NEW_MEMECLASH_CID"
    }
}' | python3 -m json.tool
```

---

## DO NOT DO YET (Post-Warmup)

These happen AFTER the 2-week warmup / marketing period:

- [ ] Start Round 1 (call `start_round` on contract)
- [ ] Run checkpoint daemon
- [ ] Additional treasury deposits (3M per round)
- [ ] Send airdrop vouchers to 80K users
- [ ] Update frontend code references

---

## Summary — After All Steps

| Item | Value |
|------|-------|
| $CHAD Asset ID | **190** |
| $GIGA Asset ID | **191** |
| CHAD/BEAM LP Token | **192** |
| GIGA/BEAM LP Token | **193** |
| MemeClash Contract ID | **d753ecb032b59f95d83bda64d5ed67baecc78068428be0cfae44c4dc2e4b6282** |
| CHAD initial price | 0.0001429 BEAM |
| GIGA initial price | 0.0001429 BEAM |
| CHAD burned (BlackHole) | 450,000,000 |
| GIGA burned (BlackHole) | 450,000,000 |
| CHAD treasury (initial) | 3,000,000 |
| GIGA treasury (initial) | 3,000,000 |
| Remaining for treasury | 97,000,000 per team |
| Remaining for airdrop | 100,000,000 per team |
| Deployed from wallet | FOMO (`.beam-light-wallet/wallets/FOMO/wallet.db`) |
| Deployed at height | ~3748115 |
| Date | 2026-02-25 |

### Transaction IDs
| Step | TX ID |
|------|-------|
| Create CHAD | `126aa8a6a21e4ae69452edb51d99d898` |
| Create GIGA | `d48f03fa234b4c40adb96248a7183080` |
| Mint CHAD 1B | `faf63063666b41d9b4090ff8bb4af156` |
| Mint GIGA 1B | `cd464141b97f453a85744157aaa71078` |
| Create CHAD/BEAM pool | `5c6bfc011d3444d89e470bb1bec28d7d` |
| Create GIGA/BEAM pool | `8bfd643e1e4e4e23a077a608319d0742` |
| Add CHAD LP (50K+350M) | `3ee69acb76844a02a0eb427459bbb830` |
| Add GIGA LP (50K+350M) | `bb513084c4e447b0b0095b72e4205dde` |
| Burn 450M CHAD | `00b2bd5047094a8fb00392b1edb78bcf` |
| Burn 450M GIGA | `e32bbb8521eb4ebf90a2fe76f24533b6` |
| Deploy MemeClash v9 | `d121495bc05c43a8bc718e591c78f328` |
| Treasury CHAD 3M | `f85b0102a37f4831aa87c065981fbbb9` |
| Treasury GIGA 3M | `40b079b88ce04217bc3b70893d00f5e4` |
