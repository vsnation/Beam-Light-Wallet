# P2P escrow: does this code make sense?

Short answer: **no. Do not deploy it, do not enable it, and do not rework it.**

Not because it is badly written — parts of it are careful — but because it is an
unfinished prototype whose missing pieces are the ones that make an escrow an
escrow. Every finding below was read out of `contracts/p2p_escrow/contract.cpp`
directly.

## Nothing is at risk today

| | |
|---|---|
| Contract | `95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf` |
| Funds held | **zero** |
| Calls ever made | **2** |
| Wallet UI | disabled — `FEATURE_P2P = false` |

So this is a decision about the code's future, not an incident.

## 1. Authorisation is decorative — 13 of 21 methods

A BVM method that receives a public key must call `Env::AddSig` on it, or it has
only checked *which key was named*, not *who is calling*. Parsing every method
body: **13 of the 21 that read a caller-supplied key never call it.**

`Method_17` (add_manager) is the whole problem in five lines:

```cpp
Manager owner;
Env::Halt_if(!LoadManager(r.m_OwnerPk, owner));
Env::Halt_if(!owner.m_IsOwner);   // "Only owner can add managers"
...
SaveManager(r.m_NewManager, m);
```

Manager records live in contract state and `app.cpp`'s `view_managers` lists
them, so the owner's key is public. **Anyone can pass it and appoint themselves
a manager** — and managers withdraw fees, seat the escrows who decide disputes,
and change the settings.

| Unauthorised | What it permits |
|---|---|
| 17, 18 — add/remove manager | take over the manager set |
| 15, 16 — assign escrows, update settings | choose the jury, change the rules |
| 6 — mark_payment_sent | assert the buyer paid, on their behalf |
| 10 — submit_feedback | forge anyone's reputation |
| 2, 3, 5, 8, 11 | act as any user |

Eight methods *do* authorise correctly — `cancel_order`, `confirm_payment`,
`escrow_vote`, `unstake`, `claim_rewards`, `withdraw_fees`. Someone knew the
rule and applied it unevenly. This repository has already been bitten by exactly
this once, as `CheckSigs, Keys=1`.

## 2. The timeouts do not exist

`PAYMENT_TIMEOUT`, `CONFIRM_TIMEOUT` and `DISPUTE_TIMEOUT` are defined,
configurable through `update_settings`, written into every trade as deadlines —
and **never compared to anything**. Across 1,113 lines there is exactly one
comparison against block height, `contract.cpp:930`, the unstake lock.

So every state holding money exits only if a specific named party chooses to
act. A buyer who accepts a trade and then walks away leaves the seller's funds
locked with no timeout, no refund and no appeal.

## 3. A trade can never be cancelled

`TradeStatus::Cancelled` appears **zero times** as an assignment. The status
exists in the enum and nothing ever sets it.

## 4. Disputes have no jury

```cpp
// TODO: Select random escrows from stake pool
```
`contract.cpp:653`. Escrows must be seated manually — by `Method_15`, which is
one of the unauthorised ones. So the mechanism that decides who gets the money
is both incomplete and open to anyone.

## 5. The one time comparison confuses seconds with blocks

The constants are written in seconds and added to a block height:

```cpp
static const uint32_t LOCK_PERIOD = 5 * 60;   // "5 minutes (TEST)"
```

That is 300 **blocks** — about five hours, not five minutes. The production
value commented out just below is `180 * 24 * 60 * 60` = 15,552,000 blocks,
which at roughly a minute a block is **about 29 years**. Uncommenting the
production constants would lock every escrow stake for three decades, with no
admin override.

## What to do instead

Don't patch it. The authorisation model has to be rebuilt method by method, the
timeout layer written from scratch, cancellation implemented, and juror
selection designed — at which point nothing of the original remains except the
fund arithmetic, which is the one part that *is* sound (every payout path
balances; deposits and the 0.5% fee are correctly proportioned).

And the design has a problem no amount of code fixes: escrow-plus-jury needs a
manager you trust to seat honest jurors. That is precisely the trust the wallet's
atomic-swap work removes. `docs/P2P_REWORK.md` already points at a cross-chain
DEX instead — that is the right direction, and this contract should not be
carried into it.

If P2P returns, the only piece worth taking is the fee and deposit arithmetic.

---

Audited 2026-08-10. Findings verified against the source by brace-matched
parsing of every method body, not by sampling.
