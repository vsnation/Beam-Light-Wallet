# P2P: cut for now, rebuilt as a cross-chain DEX

**Status:** disabled in the default build (`FEATURE_P2P = false` in `src/js/app.js`).
The page, the iframe and the ~10,000 lines behind it are still in the tree; the
flag is the only thing standing between them and users.

---

## Why it was cut

Not because peer-to-peer trading is a bad idea — because this implementation
cannot be made to work as it stands.

- **Its sync backbone is dead.** `src/p2p/p2p.js` points at
  `gun-manhattan.herokuapp.com` in three places. It returns **404** — Heroku
  removed free dynos in November 2022. Orders were never propagating; the
  failure path is a `console.warn`, so it looked alive.
- **It cannot run inside a signed app.** It does unsynchronised
  read-modify-write of JSON files under the install directory. A signed macOS
  bundle is read-only, so this breaks the moment the app is packaged properly.
- **Its trust scores are local files.** Any process on the machine can edit
  them. Reputation that a user can rewrite is worse than no reputation, because
  it invites trust.
- **It cost every user 635 KB on every launch** for a feature most sessions
  never opened, plus a CDN script with no SRI.
- **It is a second monolith.** 10,077 lines of JS and 7,729 of CSS to maintain
  alongside a 14,000-line `app.js`, for an alpha feature.

Shipping it disabled is honest. Shipping it broken is not.

---

## What it should become

> "P2P should be like a decentralized exchange, where users can trade any asset
> from any other chain to other assets. It should work easy, with no
> complexities."

That is a different product from what exists. The current design is an
escrow-and-reputation fiat marketplace: orders, disputes, staked arbitrators,
chat, feedback. The target is a swap: pick two assets, see a price, trade.

### The shape

```
   You have                    You want
   ┌──────────────┐            ┌──────────────┐
   │ 1.5  BEAM  ▾ │    ⇄       │ ~42  USDT  ▾ │
   └──────────────┘            └──────────────┘
   rate 1 BEAM = 28.4 USDT · fee 0.3% · arrives in ~2 min
   ┌────────────────────────────────────────────┐
   │                  Swap                      │
   └────────────────────────────────────────────┘
```

One screen. No order book to read, no counterparty to choose, no chat, no
dispute flow. If a user has to understand escrow mechanics, the design failed.

### What that requires

The hard part is not the UI, it is settlement across chains without a custodian.
Three honest options, in increasing order of ambition:

1. **Same-chain first (weeks).** Any Confidential Asset ⇄ any other, through the
   existing AMM at `729fe098…`. This already works — the DEX page does it. The
   win is presenting it as the swap above rather than as a pool interface. No
   new trust assumptions. **Start here.**

2. **Atomic swaps (months).** BEAM already ships atomic swap support for BTC,
   LTC, DOGE, DASH, ETH — `BEAM_ATOMIC_SWAP_SUPPORT` is on by default and
   `wallet/transactions/swaps` is compiled in. Trustless, no bridge, no custody.
   Limited to the chains BEAM implements, and needs a way to find a counterparty
   — which is the part the dead Gun relay was trying to be. Replace it with an
   on-chain order board (a contract) so discovery inherits the chain's
   availability instead of a free Heroku dyno.

3. **Bridged assets (later, and carefully).** Anything beyond those chains means
   a bridge, and a bridge means someone can be hacked. Do not build one. If
   cross-chain breadth matters more than trustlessness, integrate an existing
   aggregator and be explicit in the UI that it is custodial for the duration of
   the swap. Never present a bridged swap and an atomic swap as the same thing.

### Non-negotiables for the rebuild

- **Discovery on-chain, not on someone's free dyno.** The order board is a
  contract or it does not exist.
- **No JSON files as a database.** State lives on chain or in the wallet DB.
- **Reputation must be earned on-chain or not shown at all.**
- **Lazy-loaded.** No bytes for users who never open it.
- **One screen.** If it needs a tutorial, it is the wrong design.

---

## Bringing the old page back

`FEATURE_P2P = true` in `src/js/app.js` restores it verbatim — nav item,
App Store card, route and iframe. Nothing was deleted, so the rework can lift
whatever is worth keeping (the escrow contract at
`95d077dcd070c3fe5021b4cd385684372ca0148e8cc90e16338dd00dec31b0bf` is deployed
and its source is now tracked in `contracts/p2p_escrow/`).
