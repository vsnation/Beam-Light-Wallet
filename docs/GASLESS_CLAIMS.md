# Gasless airdrop claims

**Problem.** A BEAM transaction pays a kernel fee in BEAM. A brand-new user
holds zero BEAM, so they cannot construct any transaction at all — they have no
inputs to spend. That means they cannot claim a FOMO or BEAMX voucher, which is
precisely the barrier an airdrop exists to remove. "Claim your free tokens (you
will need to buy some BEAM first)" is not an airdrop.

**Solution.** The contract releases a little BEAM alongside the voucher asset,
in the same transaction, so the claim funds its own fee.

---

## Why this works

From `wallet/core/contract_transaction.cpp` in the BEAM source:

```cpp
if (vData.m_IsSender)
    fm[0] += fee;                       // fee added to the BEAM spend map

BaseTxBuilder::Balance bb(builder);
for (auto it = fm.begin(); fm.end() != it; it++)
    bb.m_Map[it->first].m_Value -= it->second;

bb.CompleteBalance();                   // will select coins as needed
```

`fm` is the net funds movement of the contract call. `FundsUnlock` contributes
**negatively** to it. So if the contract unlocks at least `fee` worth of BEAM,
`fm[0] <= 0` after the fee is added, the balance is already satisfied, and
`CompleteBalance()` selects **no coins**. The user needs nothing to start.

This is not a relayer, a meta-transaction or a paymaster. There is no third
party in the flow and no extra signature: the claimer still signs their own
transaction with `Env::AddSig(redeemer)`. The fee simply comes out of the
contract rather than the claimer's pocket.

---

## Contract changes

New state, keyed by `KeyTag::GasPool = 5`:

```cpp
struct GasPool {
    Amount   m_Balance;         // BEAM available to sponsor claims
    Amount   m_PerClaim;        // released per gasless claim (0 disables)
    Amount   m_TotalSponsored;  // lifetime deposits
    Amount   m_TotalSpent;      // lifetime released
    uint64_t m_ClaimsFunded;
};
```

| Method | Who | What |
|---|---|---|
| 7 `SponsorGas` | **anyone** | `FundsLock(0, amount)` into the pool |
| 8 `SetGasPerClaim` | owner | tune the subsidy, `0` disables |
| 9 `WithdrawGas` | owner | reclaim unspent sponsorship |

`RedeemVoucher` (method 3) now also does `FundsUnlock(0, perClaim)` when the pool
can cover it. It is skipped when the voucher already pays out enough BEAM to
cover its own fee, and when the pool is empty or disabled — a claim must still
succeed for a user who does have BEAM.

`SponsorGas` is deliberately **not** owner-gated and **not** signed. It only
ever increases the contract's BEAM balance, and the transaction itself is proof
the sponsor paid. Anyone can fund the pool: the project, a community member, or
the airdrop's own creator.

### Griefing analysis

The obvious attack is to mint your own batch of worthless vouchers and redeem
them repeatedly to drain the pool. It does not pay:

- A voucher can only ever be redeemed once, so the total exposure is bounded by
  the number of vouchers in existence, not by attacker effort.
- Creating the batch costs a kernel fee **and** the contract's 1% creation fee.
- Each claim costs the attacker a kernel fee of roughly `m_PerClaim`.

So the attacker spends about one fee to extract about one fee, having already
paid to create the batch. Keep `m_PerClaim` close to a single kernel fee
(~0.001–0.002 BEAM) and the arithmetic never turns positive. Raising it well
above the real fee is what would make this exploitable — do not.

---

## Status

Both shaders compile and export correctly:

```
airdrop_contract_v2_gasless.wasm  ->  Ctor Dtor Method_2..Method_9
airdrop_app_v2_gasless.wasm       ->  Method_0 Method_1
```

The UI is built: the Airdrop page shows pool balance, how many claims it covers,
the per-claim subsidy and how many claims it has already paid for, with a
deposit control any user can use.

**Not deployed.** The live contract `8737e0d3…` predates this and has no
`Method_7`, so `AIRDROP_GAS_SUPPORTED = false` in `app.js` and the UI says
"not on this contract" rather than offering a control that would build a
transaction and then fail.

### Deploying is a decision, not a step

Deploying produces a **new contract ID**, and the current one holds real locked
funds — 10.56 BEAM and 7.04 FOMO of unclaimed vouchers at the time of writing.
Those do not migrate. Options, in order of preference:

1. **Cancel outstanding batches first**, let the funds return to their creators,
   then deploy and switch. Cleanest, needs coordination with anyone holding
   unclaimed codes.
2. **Run both**: keep the old CID readable for existing codes, point new batches
   at the new one. The wallet would need to check both, which is real
   complexity for a temporary state.
3. **Deploy and abandon** the outstanding vouchers. Cheapest, and it takes
   money from people who hold valid codes. Do not.

To deploy once that is settled:

```bash
./binaries/macos/beam-wallet shader \
    --wallet_path=wallets/<name>/wallet.db --config_file=<0600 cfg with pass=> \
    --node_addr=<node> \
    --shader_app_file=shaders/airdrop_app_v2_gasless.wasm \
    --shader_contract_file=shaders/airdrop_contract_v2_gasless.wasm \
    --shader_args="role=manager,action=create" <<< "y"
```

Then, in one commit: set `AIRDROP_CID` to the new id in `src/js/app.js`,
`serve.py` and the standalone dApp, flip `AIRDROP_GAS_SUPPORTED` to `true`,
replace `shaders/airdrop_app.wasm` with the v2 app shader, and fund the pool
with `SponsorGas` plus `SetGasPerClaim`.

The v2 **app** shader is backward compatible with the v1 contract for existing
actions — `CreateBatch`, `RedeemVoucher` and `CancelBatch` argument layouts are
unchanged — so it can ship before the contract is replaced. Only methods 7–9
require the new deployment.
