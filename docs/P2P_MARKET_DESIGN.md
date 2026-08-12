# A P2P market with no escrow and no disputes

Your brief: *decentralised, cross-chain, both sides lock, no escrow, no disputes,
watchers confirm, nobody can capture the decision, create-and-fill, best UX —
and maybe we're the central party.*

The short version: **the settlement mechanism you described already exists,
already ships in this wallet, and already works for nine assets. It has never
been used once.** Four designs were explored and judged; each was holed by an
attacker, a builder and a sceptic. What survived is not a protocol — it's four
constraints that rule out most of what sounds appealing, and one honest plan.

---

## Four constraints, verified from source

These are not opinions. Each was checked against the running binary or BEAM's
own headers, because three of the four designs died on exactly these rocks.

### 1. A BVM contract cannot pay a named third party

From `beam-repo/bvm/bvm2_opcodes.h:239`:

```c
#define BVMOp_FundsUnlock(macro, sep) \
	macro(AssetID, aid) sep \
	macro(Amount, amount)
```

**No destination parameter.** Funds are released to the invoking transaction —
whoever called it. The only way to control who that is is `Env::AddSig`, exactly
as this repo's own airdrop contract documents:

```c
// SECURITY: Require redeemer's cryptographic signature
// Combined with FundsUnlock, this ensures only the signer receives funds
Env::AddSig(arg.m_Redeemer);
Env::FundsUnlock(v.m_AssetId, v.m_Value);
```

**This kills the watcher idea as stated.** A permissionless "anyone can call
`Claim` to settle for the honest party" method pays *the caller*. The first
watcher to see it — or the counterparty — takes the funds. One of the four
designs had precisely this hole and an attacker found it immediately.

### 2. There is no generic messaging layer

BEAM's SBBS is often described as a message bus. Through the shipped wallet-api
it is not:

| Method | Result |
|---|---|
| `bbs_send` | `-32601 Procedure not found` |
| `send_bbs_message` | `-32601 Procedure not found` |
| `broadcast_message` | `-32601 Procedure not found` |
| `swap_offers_board` | works |

The **only** SBBS surface is the swap offer board. So request-for-quote, order
negotiation, and off-board matching cannot be built in JS or Python on the
shipped binary. They are C++ work in the beam repo.

### 3. We cannot build cross-chain transactions ourselves

```
grep -riE "p2wsh|witness|sighash|bip143|cltv|scriptpubkey" src/ serve.py scripts/
```
Six matches, all of them English wordlists in a Chrome profile. **There is no
Bitcoin transaction capability in this codebase at all.** The far leg lives
entirely inside BEAM's C++ atomic-swap subsystem, driven through six RPCs:

`swap_offers_list` · `swap_offers_board` · `swap_create_offer` ·
`swap_publish_offer` · `swap_accept_offer` · `swap_cancel_offer`
(plus `swap_recommended_fee_rate`; `swap_get_tx_status` does not exist)

Any design requiring us to construct, sign or verify a Bitcoin transaction is
not a six-week project. It is a BTC keystore with its own seed and recovery UX,
an Electrum client with header and merkle verification, P2WSH, BIP143 sighash,
fee estimation, change, dust, RBF, reorg handling — written twice, once in the
wallet and once in the market maker, with user funds on the line the whole time.

### 4. Nine assets already work; the board is empty

Probed against the running wallet-api by offering each currency and reading how
far validation got:

| Accepted | Rejected |
|---|---|
| BTC, LTC, ETH, DASH, DOGE, QTUM, USDT, DAI, WBTC | BCH, XMR, FIRO, SOL |

(Note BCH is rejected despite the docs claiming support.)

And `swap_offers_list` returns `[]`. BEAM mainnet has recorded **zero completed
atomic swaps**. That was true when the swap-market page was built and it is true
now.

---

## What this means

Atomic swap **is** your brief. Both sides lock on their own chain. One secret
releases both. If the counterparty walks away, the timelock expires and each
side takes their own money back. No escrow, no arbitrator, no dispute, no jury —
and therefore **no decision anyone can capture**. Your "nobody can take 50% of
the choice" property doesn't need a threshold scheme; it comes free from there
being no vote at all.

So the honest conclusion is uncomfortable but clear:

> **Do not build a new protocol. The protocol is not the problem. Build the
> market.**

Zero swaps have completed not because the cryptography was missing, but because
there is nobody to trade with, and because a multi-minute two-chain swap is
miserable to sit through.

### What "watchers" can honestly be

Not fund-releasing agents — constraint 1 forbids that. What they *can* be:

- **Availability witnesses.** Republish offers so the board isn't dependent on
  one node being reachable. They handle no funds, so there is nothing to steal.
- **Liveness reporters.** Record publicly that a maker accepted and then stalled.
  Reputation is not enforcement, and should never be sold as enforcement, but it
  prices the behaviour.
- **Refund reminders.** A swap's refund path is time-locked; a watcher that
  reminds you to claim yours cannot claim it for you.

Everything a watcher does must be something that, if the watcher is malicious,
costs you nothing. The moment a watcher can move value, it is an escrow — which
you explicitly ruled out, and rightly.

### Can we be the central party?

Yes, for the two things that don't require trust — and that's the whole point.

| Layer | Who controls it | Can we abuse it? |
|---|---|---|
| **Settlement** | the two chains | No. We are never in the path. |
| **Discovery** | us, and anyone who mirrors | Only by censoring — and the SBBS board is public, so anyone can bypass us. |
| **Liquidity** | us, with our own capital | We take market risk. That's a business, not a trust assumption. |

Being the place people find each other and **the maker of first resort** is a
real, defensible position. It requires nobody to trust us with money, and it is
the only thing that fixes an empty board.

---

## What to build

**First — make the board worth looking at.** The market maker is not phase three,
it is phase one. A board with no orders converts nobody, however good the UI. We
quote both sides of BEAM/BTC and BEAM/LTC with our own capital, on a spread that
pays for the risk. Everything else is decoration until this exists.

**Second — make one swap feel like one action.** This is where the product is
won or lost. A cross-chain swap takes minutes across two chains. The screen must
carry the person through it: what has happened, what is happening, what happens
if they close the laptop (their refund path is time-locked and safe — say so, on
screen, before they start). The existing `src/js/pages/swap-market.js` and
`onboard.js` are the starting point.

**Third — reduce the setup cliff.** Today a BTC swap needs an Electrum
connection the user must configure, and a second seed they must record. The
onboarding flow already does this; it needs to be the smoothest part of the
product rather than the roughest.

**Only then — more chains.** Each new chain is a bridge in BEAM core, in C++,
not a feature we can add from here.

---

## What this cannot do

Stated plainly, because a design without limits is unexamined:

- **Monero, and any chain without scripting.** No HTLC is expressible. It needs
  adaptor signatures — real cryptography, in beam core, not a UI task. Do not
  put XMR on a roadmap slide.
- **Fiat.** Every fiat P2P design needs a human to attest that money arrived,
  which is a dispute process wearing a hat. It is incompatible with your brief.
  If fiat is wanted, it is a different product with different promises.
- **Instant.** Two chains must confirm. Minutes, not seconds. The UI can make
  waiting tolerable; it cannot make it short.
- **Both parties offline.** BEAM transactions are interactive. A resting order is
  a promise to be online when someone fills it — which is exactly why a
  market-making bot, not a hopeful retail board, is the first thing to build.
- **Enforced good behaviour.** Without escrow, a maker who abandons a swap costs
  the taker time and fees. Bonds can price that, but every bond scheme judged
  here had the bond capturable by the side holding the secret. Treat bonds as
  unsolved rather than as a feature.

---

## Why the other designs failed

Kept because the failures are more instructive than the proposals:

| Design | Killed by |
|---|---|
| Permissionless watcher settlement | `FundsUnlock` pays the caller — the watcher takes the funds |
| RFQ / negotiated orders | no SBBS messaging RPC; C++ work in beam core |
| Custom cross-chain HTLC with bonds | no Bitcoin tx capability here; 2–4 months, funds at risk throughout |
| Bond-secured fills | in each variant the secret-holder could reclaim both bonds |

One design also had the secret on the wrong side of the swap — the taker held
it while the maker was expected to redeem with it — which loses the maker's
entire leg every trade. That is the failure mode HTLCs are famous for, and it is
why "use the native implementation" is a security argument, not laziness.

---

Written 2026-08-12. Constraints 1–4 verified against `bvm2_opcodes.h`, the
running wallet-api, and the repository itself; the currency table was produced by
probing `swap_create_offer` for each asset.
