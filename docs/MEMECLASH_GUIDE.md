# MemeClash — Complete Internal Guide

**For:** Internal team, marketing agents, community managers, developers
**Game:** MemeClash v5 (live on BEAM mainnet)
**Last updated:** February 2026

---

## What Is MemeClash?

MemeClash is an on-chain meme token battle game on the BEAM blockchain. Two meme tokens — **$CHAD** and **$GIGA** — fight in **24-hour rounds**. The winner is determined by which token's DEX (decentralized exchange) pool attracted more BEAM liquidity during the round. The loser's treasury gets sold on the DEX, converted to the winner's token, and **permanently burned** — making the winner more scarce.

It's inspired by Stadium Finance (ETH/BSC) but built natively on BEAM's privacy-first smart contract platform.

**One sentence pitch:** "Pick a team, buy tokens, and watch your side battle for daily burns — losers get destroyed, winners get scarcer."

---

## The Tokens

| Token | Asset ID | Color | Role |
|-------|----------|-------|------|
| **$CHAD** | 187 | Green (#25c2a0) | Team 1 — the chad meme fighter |
| **$GIGA** | 186 | Purple (#a855f7) | Team 2 — the giga meme fighter |
| **BEAM** | 0 | — | Native currency, used to buy both tokens |
| **FOMO** | 174 | — | Ecosystem token, receives 10% buyback from rounds |

Both $CHAD and $GIGA have their own AMM liquidity pools on BEAM's DEX:
- CHAD/BEAM pool (pool kind=2, standard AMM)
- GIGA/BEAM pool (pool kind=2, standard AMM)

Prices are set by the AMM constant-product formula (like Uniswap). More buying = higher price. More selling = lower price.

---

## How a Round Works (Step by Step)

Each round lasts **1440 blocks (~24 hours at 60 seconds per block)**. Here's the exact lifecycle:

### Phase 1: Active (24 hours)

```
Round starts → Clock begins → Users buy $CHAD or $GIGA on the DEX
```

- Anyone can start a new round (no permission needed)
- The round records its start block height and end block height
- Users buy their team's token using BEAM through the in-app swap
- Each purchase has a **5% trade fee** — that 5% buys more tokens and deposits them into the team's **battle treasury**
- The other 95% of tokens go to the user's wallet
- Users can also **voluntarily deposit** tokens to their team's treasury to boost burn power
- During this phase, both DEX pools are being watched — which one attracts more BEAM?

### Phase 2: Round Ends → Snapshots Needed

```
Timer expires → Someone submits DEX snapshots (permissionless oracle)
```

- When the round expires (block height reaches end), snapshots are needed
- **Start snapshot:** DEX pool BEAM reserves at the beginning of the round
- **End snapshot:** DEX pool BEAM reserves at the end of the round
- Anyone can submit these — the app shader auto-reads the reserves from the DEX contract
- No trust required — the reserves are read directly from the blockchain

### Phase 3: Checkpoint (The Burn)

```
Snapshots submitted → Someone runs checkpoint → Winner burns loser tokens
```

This is the core mechanic. Here's exactly what happens:

1. **Winner determined:** Compare BEAM growth in each pool
   - `Growth_CHAD = End_BEAM_Reserve_CHAD - Start_BEAM_Reserve_CHAD`
   - `Growth_GIGA = End_BEAM_Reserve_GIGA - Start_BEAM_Reserve_GIGA`
   - Higher growth wins. Equal or both negative = DRAW.

2. **Loser treasury sold:** All loser tokens in the treasury are sold on the DEX for BEAM
   - Uses CallFar (cross-contract call) to the AMM
   - Binary search algorithm calculates optimal trade amounts

3. **BEAM split:**

| Split | % | What happens |
|-------|---|-------------|
| **Burn** | 85% | Used to buy winner tokens on DEX → tokens locked forever (burned) |
| **FOMO buyback** | 10% | Allocated to FOMO ecosystem pool (admin withdraws) |
| **Checkpoint caller** | 5% | BEAM reward paid to whoever ran the checkpoint |

4. **Round finalized:** Winner counter updated, lifetime stats recorded

### Phase 4: Finalized → Next Round

```
Round complete → Anyone starts next round → Cycle repeats
```

### Draw Rules

If both pools had equal growth, or both pools shrank:
- Winner = **DRAW**
- No checkpoint trades happen
- Both treasuries **carry over** to the next round intact
- No burns, no fees

---

## The Trade Fee Mechanism (TradeForTeam)

When a user buys tokens through the MemeClash UI (not directly on the DEX), the contract executes **two sequential AMM trades** in one transaction:

```
User sends 100 BEAM
├── 5 BEAM (5% fee) → Buy team tokens → Deposit to team treasury
└── 95 BEAM (95%) → Buy team tokens → Send to user's wallet
```

This means every purchase automatically grows the team's treasury. The more people buy, the bigger the potential burn.

**Important detail:** The fee trade happens FIRST, then the user trade happens on the updated pool reserves. This is critical for accurate quotes.

### Lifetime trade stats tracked on-chain:
- `total_trade_volume` — total BEAM traded through the contract
- `total_trade_fees0` — total $CHAD tokens deposited to treasury from fees
- `total_trade_fees1` — total $GIGA tokens deposited to treasury from fees

---

## User Actions (What Players Can Do)

### 1. Buy Team Tokens
- Choose $CHAD or $GIGA
- Enter BEAM amount
- Get a live quote (debounced 500ms)
- 5% goes to team treasury, 95% to wallet
- Requires BEAM balance

### 2. Deposit to Treasury
- Donate tokens directly to team treasury
- Increases burn power for that team
- Tokens are locked until the round ends

### 3. Run Checkpoint (Earn 5%)
- Anyone can do this after a round ends and snapshots are submitted
- The caller earns **5% of all BEAM received from selling the loser treasury**
- Fully automated — one click, the app shader calculates everything
- This is a real economic incentive for community participation

### 4. Submit Snapshots
- Anyone can submit DEX pool snapshots
- The app shader auto-reads reserves from the DEX contract
- Required before checkpoint can run

### 5. Start New Round
- Anyone can start a round when no round is active
- No cost, no permission needed

### 6. Withdraw Payout
- Checkpoint callers accumulate BEAM in their payout balance
- Must explicitly withdraw (claim-first architecture)

---

## Key Numbers

| Parameter | Value | Notes |
|-----------|-------|-------|
| Round duration | 1440 blocks (~24h) | Configurable by admin |
| Trade fee | 5% (500 bps) | Goes to team treasury |
| Checkpoint caller fee | 5% (500 bps) | BEAM reward |
| FOMO buyback | 10% (1000 bps) | Ecosystem allocation |
| Burn | 85% (8500 bps) | Winner tokens destroyed |
| Pool kind | 2 (standard) | 1% AMM fee tier |
| DEX contract | `729fe098...` | BEAM's AMM DEX |
| MemeClash contract | `c975d563...` | v5, live on mainnet |
| $CHAD asset ID | 187 | |
| $GIGA asset ID | 186 | |
| FOMO asset ID | 174 | |
| BEAM decimals | 8 | 1 BEAM = 100,000,000 groth |

---

## What the Frontend Shows

The MemeClash page has these sections (top to bottom):

### 1. Header
"MEME CLASH" title with gradient text (green → white → purple). Subtitle: "$CHAD vs $GIGA"

### 2. Payout Banner
Only shown if user has withdrawable balance. Shows amount + "Withdraw" button.

### 3. Battle Arena (Hero Section)
- Round number, timer ("4h 32m left"), phase pill
- Two team cards side by side: avatar, name, treasury amount, DEX pool BEAM reserve
- Power bar showing treasury percentage split (e.g., CHAD 62% | 38% GIGA)
- Action buttons based on phase (Submit Snapshot / Run Checkpoint / Start Next Round)
- Winner announcement with crown emoji after checkpoint

### 4. Price Sparkline Cards
Two side-by-side cards showing:
- Token name with team color
- Current spot price from DEX pool (e.g., "0.0₅98 BEAM")
- SVG sparkline chart showing historical price trend from past round data
- Percentage change (green up / red down)

### 5. Buy Team Tokens (Swap UI)
- Team toggle ($CHAD / $GIGA)
- Balance display
- BEAM amount input
- Percentage buttons (25% / 50% / 75% / MAX)
- Live quote showing tokens received
- "Buy $CHAD" or "Buy $GIGA" button

### 6. How to Play (Expandable)
Three-step guide: Pick Team → Buy Token → Watch Battle

### 7. Deposit to Treasury
- Team toggle + amount input for voluntary donations

### 8. Lifetime Stats
Grid showing: Total Rounds, CHAD Wins, GIGA Wins, Draws, CHAD Burned, GIGA Burned, Trade Volume, Round Duration

### 9. Round History Table
Past rounds with: Round #, Winner badge, CHAD Treasury, GIGA Treasury, Burned amount

### 10. Recent Transactions
Filtered list of MemeClash contract transactions with icons, labels, amounts, and status

### 11. Admin Panel (admin only)
Settings, fee withdrawal, force end round, emergency withdraw. Hidden for regular users.

### 12. Contract ID Bar
Subtle bar at bottom showing truncated contract ID (click to copy).

---

## The Checkpoint Daemon

An automated Python script (`scripts/memeclash_checkpoint.py`) can run as a daemon to:
- Monitor round status every 60 seconds
- Auto-submit start/end snapshots when needed
- Auto-run checkpoint to resolve rounds (and earn the 5% fee)
- Auto-start new rounds after finalization

```bash
python3 scripts/memeclash_checkpoint.py --port 9080 --interval 60
```

This ensures rounds always resolve even if no human is watching. The daemon earns BEAM for every checkpoint it runs.

---

## How the AMM Math Works (For Devs)

The checkpoint uses a binary search algorithm to calculate optimal trade amounts:

**Trade 1 — Sell loser tokens for BEAM:**
- Pool has (BEAM reserves, Token reserves)
- Binary search finds: maximum BEAM to buy for ≤ loserTreasury tokens
- Uses constant product formula: `k = tok1 * tok2`
- After trade: new_tok1 = tok1 - bought, new_tok2 = tok2 + paid

**Fee split:**
- AMM fee: 1% (pool kind 2), split 70% to pool / 30% to DaoVault
- After AMM: callerFee = 5%, fomoBuyback = 10%, burnBeam = 85%

**Trade 2 — Buy winner tokens with BEAM:**
- Use the 85% BEAM to buy winner tokens on DEX
- Binary search again for optimal amount
- Bought tokens are locked in the contract forever (burned)

**Critical:** After Trade 1, pool reserves change. Trade 2 uses the UPDATED reserves (post-Trade-1). The contract uses `payPool` (not `totalPay`) for intermediate reserve calculation — `totalPay` includes the daoFee which goes to DaoVault, not the pool.

---

## Contract Architecture

```
serve.py (HTTP server)
    ↓ proxies JSON-RPC + injects WASM shader bytes
wallet-api (BEAM binary, port 10000)
    ↓ invoke_contract
MemeClash Contract (on-chain)
    ↓ CallFar for DEX trades
AMM DEX Contract (on-chain)
    ↓ AMM pool reads/trades
DaoVault (on-chain, receives AMM fees)
```

**Shader injection:** serve.py automatically injects the MemeClash app shader (WASM bytes) into any `invoke_contract` call that references the MemeClash contract ID. Users don't need to manage shader files.

---

## Contract Methods (Complete Reference)

### User Methods

| Method | Action | What it does |
|--------|--------|-------------|
| 3 | `deposit_tokens` | Deposit $CHAD or $GIGA to team treasury |
| 4 | `submit_snapshot` | Auto-read DEX pool reserves and record snapshot |
| 5 | `run_checkpoint` | Auto-calculate swaps, determine winner, execute burns |
| 6 | `withdraw` | Withdraw accumulated payout balance |
| 7 | `start_round` | Start a new round (if none active) |
| 12 | `trade_for_team` | Buy team tokens with 5% fee to treasury |

### View Methods (Read-Only)

| Action | Returns |
|--------|---------|
| `view` / `view_state` | Full contract state, config, lifetime stats |
| `view_round` | Specific round details |
| `view_current_round` | Active round + phase + blocks remaining |
| `view_history` | Past N rounds (up to 50) |
| `view_my_payout` | User's withdrawable balance (BEAM, $CHAD, $GIGA) |
| `view_pool_reserves` | Current DEX pool BEAM and token reserves for both teams |
| `view_trade_quote` | Preview trade: tokens received for X BEAM |

### Admin Methods

| Method | Action | What it does |
|--------|--------|-------------|
| 0 | `create` | Deploy contract |
| 1 | `destroy` | Destroy contract |
| 8 | `update_settings` | Change round duration, fees (0 = don't change) |
| 9 | `withdraw_fees` | Withdraw accumulated FOMO buyback BEAM |
| 10 | `emergency_withdraw` | Withdraw any stuck asset |
| 11 | `force_end_round` | Set round end to current block (testing) |

---

## Round Data Structure (What Gets Stored Per Round)

```
round_id        — Sequential round number (1, 2, 3...)
start_height    — Block height when round started
end_height      — Block height when round ends
treasury0       — $CHAD tokens in treasury this round
treasury1       — $GIGA tokens in treasury this round
winner          — 0=CHAD, 1=GIGA, 254=DRAW, 255=NONE
status          — 0=Active, 1=SnapshotReady, 2=Finalized
loser_sold      — How many loser tokens were sold on DEX
beam_received   — How much BEAM was received from selling
winner_burned   — How many winner tokens were bought and burned
caller_fee      — BEAM paid to checkpoint runner
fomo_buyback    — BEAM allocated to FOMO buyback
```

---

## Price History (How Sparklines Work)

Price data is extracted from completed rounds:

- **Loser execution price** = `beam_received / loser_sold` (how much BEAM per loser token when sold)
- **Winner execution price** = `(beam_received × 0.85) / winner_burned` (how much BEAM per winner token when bought for burn)
- **Current live price** = `beam_reserve / token_reserve` from DEX pool

Each completed round gives ~1 price point per token. The sparkline plots these chronologically with the live price as the final point.

---

## Marketing Guide

### Core Narrative

MemeClash is about **meme tribal loyalty with real on-chain consequences**. You pick a side, your money backs your team, and every day there's a winner and a loser. The loser's tokens get permanently destroyed. This creates:

1. **Real scarcity** — tokens are actually burned (locked forever in the contract)
2. **Daily engagement** — 24-hour rounds create urgency
3. **Permissionless participation** — anyone can run checkpoint and earn 5%
4. **Community competition** — which team has more conviction?

### Key Talking Points

**For crypto natives:**
- "Fully on-chain meme battles with automated DEX arbitrage"
- "85% burn rate per round — real deflationary mechanics, not emissions games"
- "Permissionless oracle + checkpoint = no centralized operator needed"
- "Cross-contract CallFar trades — the smart contract autonomously trades on the DEX"
- "Built on BEAM's Mimblewimble — your trades are private by default"

**For casual users:**
- "Pick $CHAD or $GIGA. Buy tokens. If your team wins, the other team's tokens get destroyed."
- "Every 24 hours, there's a winner. Loser tokens are burned forever."
- "It's like a daily meme war — but with real on-chain consequences"
- "Run the checkpoint after a round ends and earn a 5% fee in BEAM"

**For DeFi people:**
- "AMM-based winner determination — no oracle trust assumptions"
- "Liquidity growth = winning metric. More BEAM in your pool = your team wins"
- "5% trade fee flows to treasury = bigger burns = more scarcity"
- "Two-stage DEX swaps in one atomic transaction via CallFar"

### Content Ideas

**Daily round results:**
- "Round #X results: $CHAD/$GIGA wins! Y tokens burned forever. Z BEAM in fees distributed."
- Include: winner, loser treasury size, tokens burned, checkpoint caller fee

**Stats posts:**
- "Lifetime burns: X million $CHAD and Y million $GIGA destroyed"
- "Total trade volume through MemeClash: Z BEAM"
- "CHAD leads with N wins vs GIGA's M wins"

**Engagement hooks:**
- "Which team are you backing today? $CHAD or $GIGA?"
- "Round ends in 3 hours — GIGA is ahead. Can CHAD catch up?"
- "Someone just deposited 10M tokens to CHAD treasury. The burn is going to be massive."
- "Run the checkpoint and earn 5% — anyone can do it"

**Educational:**
- "How MemeClash burns work: loser tokens → DEX → BEAM → winner tokens → burned forever"
- "Why the 5% checkpoint fee matters: fully decentralized, anyone can earn"
- "Privacy + meme battles: only on BEAM"

### Tone

- Playful but technically accurate
- Use team colors and rivalry language
- Never promise financial returns
- Focus on mechanics, burns, and community competition
- Reference specific numbers (rounds completed, tokens burned, volume)
- BEAM privacy is the backdrop, not the main pitch — the game is the hook

### Visual Identity

| Element | CHAD | GIGA |
|---------|------|------|
| Color | #25c2a0 (green) | #a855f7 (purple) |
| Bright | #00ffcc | #d4a0ff |
| Glow | rgba(37,194,160,0.35) | rgba(168,85,247,0.35) |
| Emoji | Any chad/strong meme | Any giga/brain meme |

Background: #0a0e17 (dark navy), Cards: #0d1320, Text: #f8fafc

---

## Technical Reference

### How to Access MemeClash

```bash
# Start the wallet server
cd LightWallet
python3 serve.py 9080

# Open in browser
open http://127.0.0.1:9080

# Unlock wallet → Navigate to MemeClash in sidebar
```

### Contract ID
```
c975d5634b1b248876d1b70eecc04bdf8462d2586f76d9df5de266ea1e8d3c60
```

### DEX Contract ID
```
729fe098d9fd2b57705db1a05a74103dd4b891f535aef2ae69b47bcfdeef9cbf
```

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/js/pages/meme_battle.js` | Frontend UI + all user interactions | ~1800 |
| `src/css/meme_battle.css` | All MemeClash styling | ~1660 |
| `contracts/memeclash/contract.h` | Data structures, method params, constants | 320 |
| `contracts/memeclash/contract.cpp` | On-chain contract logic (validator) | ~900 |
| `contracts/memeclash/app.cpp` | Client-side shader (views + tx builders) | 1287 |
| `scripts/memeclash_checkpoint.py` | Automated checkpoint daemon | 225 |
| `shaders/memeclash_app.wasm` | Compiled app shader (loaded by serve.py) | binary |
| `shaders/memeclash_contract.wasm` | Compiled contract shader (deployed on-chain) | binary |

### API Calls (via serve.py proxy)

All calls go to `POST http://127.0.0.1:9080/api/wallet` as JSON-RPC:

```json
{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "invoke_contract",
    "params": {
        "args": "role=user,action=view_current_round,cid=c975d5634b1b248876d1b70eecc04bdf8462d2586f76d9df5de266ea1e8d3c60"
    }
}
```

For transactions, add `"create_tx": true` and then call `process_invoke_data` with the returned `raw_data`.

### Version History

| Version | Contract ID | Key Change |
|---------|------------|------------|
| v1 | `bfa814...` | Initial deploy, nCharge fix |
| v2 | `1c0a08...` | ForceEndRound added, CheckSigs issue |
| v3 | `3979b8...` | AddSig fix + ForceEndRound working |
| v4 | `1ba58a...` | TradeForTeam fund flow fix |
| v5 | `c975d5...` | Trade fees, admin panel, payPool fix (**current**) |

---

## FAQ

**Q: Can someone manipulate the winner?**
A: The winner is determined by DEX pool reserve growth. To manipulate it, you'd need to add more BEAM liquidity to one pool than the other — which costs real money. The snapshots are read directly from the DEX contract state, not from user input.

**Q: What happens to burned tokens?**
A: They are locked in the MemeClash contract forever. No one — not even the admin — can retrieve them. The contract does have an `emergency_withdraw` for stuck funds, but burned tokens are tracked separately.

**Q: Can the admin change the rules mid-round?**
A: Settings changes (round duration, fees) only affect NEW rounds. The active round keeps its original parameters.

**Q: What if nobody runs the checkpoint?**
A: The round just stays in "ready_for_checkpoint" state until someone does. The 5% fee incentivizes someone to always do it. The checkpoint daemon automates this.

**Q: Is this on mainnet?**
A: Yes. Contract v5 is live on BEAM mainnet with real tokens and real BEAM.

**Q: Do I need a local node?**
A: Yes — DEX contract calls (which MemeClash uses) require a local node with shader support. Public nodes don't support `invoke_contract`.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Treasury** | Tokens held by the contract for each team. Burned on loss. |
| **Checkpoint** | The process of resolving a round: determine winner, sell loser, burn winner. |
| **Snapshot** | A recording of DEX pool reserves at a specific block height. |
| **CallFar** | Cross-contract call from MemeClash to the DEX AMM. |
| **Burn** | Tokens bought and locked in the contract forever (permanently removed from circulation). |
| **Groth** | Smallest unit of BEAM. 1 BEAM = 100,000,000 groth. |
| **BPS** | Basis points. 100 bps = 1%. 10000 bps = 100%. |
| **Pool kind** | AMM fee tier. Kind 2 = 1% fee (standard). |
| **payPool** | The portion of AMM trade payment that goes to pool reserves (excludes daoFee). |
