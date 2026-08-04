# BEAM Shader Development Guide

A comprehensive guide for developing BEAM smart contracts (shaders) based on research from the official BEAM repository.

## Overview

BEAM shaders are smart contracts compiled to WebAssembly (WASM) that run on the BEAM Virtual Machine (BVM). Unlike Ethereum's EVM, BEAM shaders leverage Mimblewimble's privacy features while providing Turing-complete programmability.

**Key Repository:** https://github.com/BeamMW/beam/tree/master/bvm/Shaders

## Architecture

### Two Shader Types

1. **Contract Shader (`contract.cpp`)** - Runs on validators
   - Executes state changes
   - Manages funds (lock/unlock)
   - Stores persistent data
   - Methods 0,1 reserved for Ctor/Dtor

2. **App Shader (`app.cpp`)** - Runs on client
   - Provides view-only queries
   - Constructs transactions
   - No state modification
   - Interacts with wallet

### File Structure

```
my_contract/
├── contract.h       # Shared data structures and method parameters
├── contract.cpp     # Contract shader implementation
├── app.cpp         # App shader (optional, for client-side)
└── Makefile        # Build configuration
```

## Compilation

### Prerequisites

- LLVM/Clang with WebAssembly target
- BEAM shader headers (`common.h`, etc.)

### Build Command

```bash
clang -O3 \
  --target=wasm32 \
  -I/path/to/beam/bvm/Shaders \
  -Wl,--export-dynamic,--no-entry,--allow-undefined \
  -nostdlib \
  -o contract.wasm \
  contract.cpp
```

### Build Script (Makefile)

```makefile
CLANG = clang
BEAM_SHADERS = ../  # Path to BEAM shader headers
CFLAGS = -O3 --target=wasm32 -I$(BEAM_SHADERS) \
         -Wl,--export-dynamic,--no-entry,--allow-undefined -nostdlib

all: contract.wasm app.wasm

contract.wasm: contract.cpp contract.h
	$(CLANG) $(CFLAGS) -o $@ contract.cpp

app.wasm: app.cpp contract.h
	$(CLANG) $(CFLAGS) -o $@ app.cpp

clean:
	rm -f *.wasm
```

## Core Concepts

### 1. Method Definition

Methods are exported using `BEAM_EXPORT` macro. Methods 0 and 1 are ALWAYS reserved:

```cpp
#include "../common.h"
#include "contract.h"

// Method 0: Constructor - REQUIRED
BEAM_EXPORT void Ctor(const MyContract::Ctor& params) {
    // Initialize contract state
}

// Method 1: Destructor - REQUIRED
BEAM_EXPORT void Dtor(const MyContract::Dtor& params) {
    // Cleanup (usually empty)
}

// Method 2+: Custom methods
BEAM_EXPORT void Method_2(const MyContract::Deposit& params) {
    // Your logic here
}
```

**Convention:** Each method takes a single struct parameter. All inputs/outputs are in that struct.

### 2. Storage (State Management)

BEAM uses key-value storage with automatic scoping per contract.

```cpp
// Define key structures
struct MyKey {
    uint8_t m_Tag = 1;      // Namespace within contract
    PubKey m_Account;       // Unique identifier
};

struct MyValue {
    Amount m_Balance;
    uint64_t m_LastUpdate;
};

// Load value
MyValue val;
bool exists = Env::LoadVar_T(key, val);

// Save value
Env::SaveVar_T(key, val);

// Delete value
Env::DelVar_T(key);
```

**Best Practice:** Use different `m_Tag` values for different data types.

### 3. Fund Management

BEAM's Mimblewimble requires balanced transactions. Contracts can lock/unlock funds:

```cpp
// Lock funds (from transaction into contract)
Env::FundsLock(assetId, amount);

// Unlock funds (from contract to transaction)
Env::FundsUnlock(assetId, amount);
```

**Important:**
- `FundsLock` moves funds INTO the contract
- `FundsUnlock` releases funds FROM the contract
- Transaction must balance (all locked = all unlocked)
- If unbalanced, transaction fails

### 4. Signature Verification

Ensure the caller owns a private key:

```cpp
// Add required signature to transaction
Env::AddSig(pubKey);

// The transaction will fail if not signed by this key
```

### 5. Error Handling

Use `Env::Halt_if()` for assertions:

```cpp
Env::Halt_if(amount == 0);           // Halt if zero amount
Env::Halt_if(!LoadSettings(s));      // Halt if settings don't exist
Env::Halt_if(caller != owner);       // Halt if unauthorized
```

### 6. Logging

Emit events for external observers:

```cpp
// Emit typed log entry
Env::EmitLog_T(key, value);
```

### 7. Height & Time

Get current blockchain height (block number):

```cpp
uint64_t currentHeight = Env::get_Height();

// Use for timestamps (1 block ≈ 1 minute on BEAM)
uint64_t deadline = currentHeight + 60;  // ~1 hour from now
```

## Data Types

### Built-in Types

```cpp
typedef uint64_t Amount;        // Token amounts (in groth)
typedef uint64_t Height;        // Block height
typedef uint64_t AssetID;       // Asset identifier (0 = BEAM)
typedef Opaque<32> ContractID;  // Contract identifier
typedef Opaque<32> ShaderID;    // Shader identifier
typedef Secp_point_data PubKey; // Public key (33 bytes compressed)
```

### Amounts

```cpp
// 1 BEAM = 100,000,000 groth
static const Amount GROTH = 100000000;
Amount oneBeam = 1 * GROTH;
Amount halfBeam = GROTH / 2;
```

### Safe Math

Use `Strict::` for overflow-checked arithmetic:

```cpp
#include "../Math.h"

Amount a = 100;
Amount b = 50;

// Safe addition (halts on overflow)
Strict::Add(a, b);  // a = 150

// Safe subtraction (halts on underflow)
Strict::Sub(a, b);  // a = 100
```

## Complete Example: Simple Vault

### contract.h

```cpp
#pragma once

namespace SimpleVault
{
    // Unique shader ID
    static const ShaderID s_SID = { /* 32 bytes */ };

    // Storage key
    struct AccountKey {
        uint8_t m_Tag = 0;
        PubKey m_pk;
    };

    // Account balance
    struct Account {
        Amount m_Balance;
    };

    // Method parameters
    struct Ctor {};
    struct Dtor {};

    struct Deposit {
        PubKey m_pk;
        Amount m_Amount;
        AssetID m_AssetId;
    };

    struct Withdraw {
        PubKey m_pk;
        Amount m_Amount;
        AssetID m_AssetId;
    };
}
```

### contract.cpp

```cpp
#include "../common.h"
#include "../Math.h"
#include "contract.h"

using namespace SimpleVault;

namespace {
    bool LoadAccount(const PubKey& pk, Account& acc) {
        AccountKey key;
        key.m_pk = pk;
        return Env::LoadVar_T(key, acc);
    }

    void SaveAccount(const PubKey& pk, const Account& acc) {
        AccountKey key;
        key.m_pk = pk;
        if (acc.m_Balance)
            Env::SaveVar_T(key, acc);
        else
            Env::DelVar_T(key);  // Delete if zero
    }
}

// Constructor
BEAM_EXPORT void Ctor(const Ctor&) {
    // Nothing to initialize
}

// Destructor
BEAM_EXPORT void Dtor(const Dtor&) {
    // Nothing to cleanup
}

// Deposit funds
BEAM_EXPORT void Method_2(const Deposit& r) {
    Env::Halt_if(r.m_Amount == 0);

    // Lock funds in contract
    Env::FundsLock(r.m_AssetId, r.m_Amount);

    // Update balance
    Account acc;
    if (!LoadAccount(r.m_pk, acc))
        acc.m_Balance = 0;

    Strict::Add(acc.m_Balance, r.m_Amount);
    SaveAccount(r.m_pk, acc);

    // Log the deposit
    Env::EmitLog_T(r.m_pk, r);
}

// Withdraw funds
BEAM_EXPORT void Method_3(const Withdraw& r) {
    Env::Halt_if(r.m_Amount == 0);

    // Require signature
    Env::AddSig(r.m_pk);

    // Load and check balance
    Account acc;
    Env::Halt_if(!LoadAccount(r.m_pk, acc));
    Env::Halt_if(acc.m_Balance < r.m_Amount);

    // Update balance
    Strict::Sub(acc.m_Balance, r.m_Amount);
    SaveAccount(r.m_pk, acc);

    // Unlock funds from contract
    Env::FundsUnlock(r.m_AssetId, r.m_Amount);
}
```

## Advanced Patterns

### 1. Multi-Asset Support

```cpp
// Store per-asset balances
struct AssetBalance {
    uint8_t m_Tag = 1;
    PubKey m_pk;
    AssetID m_AssetId;
};

// Handle multiple assets
void LockMultiple(AssetID aid1, Amount amt1, AssetID aid2, Amount amt2) {
    Env::FundsLock(aid1, amt1);
    Env::FundsLock(aid2, amt2);
}
```

### 2. Time-Locked Operations

```cpp
struct TimeLock {
    PubKey m_pk;
    Amount m_Amount;
    Height m_UnlockHeight;
};

BEAM_EXPORT void Method_4(const Unlock& r) {
    TimeLock tl;
    Env::Halt_if(!LoadTimeLock(r.m_pk, tl));

    // Check time has passed
    Env::Halt_if(Env::get_Height() < tl.m_UnlockHeight);

    // Now safe to unlock
    Env::FundsUnlock(0, tl.m_Amount);
}
```

### 3. Admin-Only Operations

```cpp
struct Settings {
    PubKey m_Admin;
    Amount m_Fee;
};

BEAM_EXPORT void Method_5(const UpdateFee& r) {
    Settings s;
    Env::Halt_if(!LoadSettings(s));

    // Only admin can update
    Env::AddSig(s.m_Admin);

    s.m_Fee = r.m_NewFee;
    SaveSettings(s);
}
```

### 4. Iterating Over Storage

```cpp
// Use VarReader to enumerate keys
Env::VarReader reader(keyPrefix, keyPrefixSize);

while (true) {
    MyKey key;
    MyValue val;

    if (!reader.MoveNext_T(key, val))
        break;

    // Process each entry
    ProcessEntry(key, val);
}
```

## Deployment

### 1. Deploy Contract

Using wallet CLI:

```bash
./beam-wallet shader --shader_app_file=app.wasm \
    --shader_args="action=create_contract" \
    --shader_contract_file=contract.wasm
```

### 2. Get Contract ID

After deployment, the contract ID (CID) is returned. Save it for interactions.

### 3. Invoke Contract

```bash
./beam-wallet shader --shader_app_file=app.wasm \
    --shader_args="action=deposit,cid=<contract_id>,amount=1000000000"
```

## Debugging

### 1. WABT (WebAssembly Binary Toolkit)

Convert WASM to readable text format:

```bash
wasm2wat contract.wasm -o contract.wat
```

Online tool: https://webassembly.github.io/wabt/demo/wasm2wat/

### 2. Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "Unbalanced transaction" | Lock/unlock mismatch | Ensure total locked = total unlocked |
| "Invalid signature" | Missing AddSig | Add `Env::AddSig(pubKey)` for required keys |
| "Variable not found" | Key doesn't exist | Check with LoadVar return value |
| "Halt" | Assertion failed | Check Halt_if conditions |

### 3. Testing Strategy

1. **Unit test** each method with mock data
2. **Integration test** on testnet
3. **Verify** state changes via app shader queries
4. **Audit** before mainnet deployment

## Security Checklist

- [ ] All funds are accounted (no stuck funds)
- [ ] Signatures required for sensitive operations
- [ ] No integer overflow/underflow (use Strict math)
- [ ] Time-based operations use block height
- [ ] Admin keys properly secured
- [ ] Reentrancy not possible (BEAM doesn't have it, but verify logic)
- [ ] All error paths halt cleanly

## Reference Contracts

Study these for patterns:

| Contract | Features |
|----------|----------|
| `vault` | Basic deposit/withdraw |
| `faucet` | Simple token distribution |
| `amm` | DEX with liquidity pools |
| `dao-core` | Governance voting |
| `oracle` | Price feeds |
| `nephrite` | Stablecoin mechanics |

## Resources

- **BEAM GitHub:** https://github.com/BeamMW/beam
- **Shaders Directory:** https://github.com/BeamMW/beam/tree/master/bvm/Shaders
- **BEAM Documentation:** https://documentation.beam.mw/
- **Developer Docs:** https://beamx.gitbook.io/developer-documentation/beam-shaders

---

*Guide created for BEAM Light Wallet P2P Escrow contract development.*
