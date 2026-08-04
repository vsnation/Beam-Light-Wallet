# MemeClash Memory Log

## Deployment History

### v9 Deployment (2026-02-25)
- **All 13 transactions confirmed** on mainnet
- Tokens: CHAD=190, GIGA=191, LP tokens: 192, 193
- Contract: `d753ecb032b59f95d83bda64d5ed67baecc78068428be0cfae44c4dc2e4b6282`
- Deployed from FOMO wallet (`~/.beam-light-wallet/wallets/FOMO/wallet.db`, pass: `slava0032`)
- Owner key: `4VNrH1X+uP1rA322MkV31kTj6N4ElKg2ttJLAdA0wegUFppPrpxkXRqX7ZB0OXq65oZ3UP+oqAGJFnKe2d1VaJ9LdNQO5RPggG3d1EuVzQv1ilJtDmiZ/gb1XY4PX6sn+GVS2E8zEuFAx93N`
- Total BEAM spent: ~100,120 BEAM (LP: 100K, creation fees: ~120)
- BEAM remaining in wallet: ~879

### Token Distribution (per token)
- 350M (35%) → DEX LP with 50,000 BEAM
- 450M (45%) → BlackHole (permanent burn)
- 3M (0.3%) → Contract treasury (first batch)
- 97M → In wallet, for future treasury deposits (3M/round)
- 100M (10%) → In wallet, reserved for airdrop

## Critical Lessons Learned

### Metadata Truncation (2026-02-25)
- **NEVER deploy tokens with long metadata strings** via Minter contract
- Minter has a metadata length limit — our full metadata with `OPT_SHORT_DESC`, `OPT_ICON_URL`, `OPT_COLOR` got truncated at `OPT_SHORT_DESC=MemeClash`
- Icon URLs, color, and full description are MISSING from on-chain metadata
- **Fix:** Hardcoded IPFS URLs in all app configs (app.js, config.js, AllDapps, BeamPay)
- **Prevention:** Test metadata length first with `create_tx: false` before committing, or use shorter metadata (drop OPT_SHORT_DESC, keep only essential fields)

### BlackHole Shader Interface
- BlackHole uses `role=manager,action=deposit` (NOT `role=user`)
- `role=user` returns "unknown Role" error
- `role=manager,action=view` lists deployed BlackHole contracts

### Deployment Sequence Matters
- Create tokens → Mint → Create pools → Add LP → Burn → Deploy contract → Seed treasury
- Wait for each TX to confirm before next (UTXO conflicts)
- Contract deployment requires beam-wallet CLI (stop wallet-api first)
- Use `<<< "y"` for confirmation prompt (not `echo "y" |`)

### Wallet Discovery
- FomoMinter wallet (`wallets/FomoMinter/`) only has ~1,929 BEAM
- FOMO wallet (`~/.beam-light-wallet/wallets/FOMO/`) has 100K+ BEAM
- Local node needs correct owner key matching the wallet being used
- Re-export owner key when switching wallets, restart node

## Design Decisions

### LP Sizing: 350M + 50K BEAM
- User decided to keep large LP because 5% TradeForTeam fee IS the whale protection
- After ~20 rounds of trading, a whale loses 64% to fees (0.95^20 = 0.358)
- TradeForTeam sends tokens to treasury (burned), NOT to buyer's wallet
- Direct DEX buyers just add buy pressure — good for token price

### Treasury: 0.3% per Round (3M per team)
- Not all 100M deposited at once
- Gradual deposits keep game sustainable for ~33 rounds
- Each round burns both treasuries (Stadium behavior)
- Keeps deflationary pressure consistent

### Allocation: 35/45/10/10
- 35% LP (350M) — deep liquidity
- 45% Burn (450M) — immediate scarcity
- 10% Treasury (100M) — game fuel, deposited gradually
- 10% Airdrop (100M) — community distribution to 80K users

## Files Modified in v9 Deployment

| File | Change |
|------|--------|
| `serve.py:207` | MEMECLASH_CONTRACT_ID → v9 CID |
| `src/js/pages/meme_battle.js:12` | MEMECLASH_CID → v9 CID |
| `src/js/pages/meme_battle.js:15-16` | MC_CHAD_AID=190, MC_GIGA_AID=191 |
| `src/js/app.js` ASSET_ICONS | Added 190, 191 with IPFS URLs |
| `src/js/app.js` ASSET_CONFIG | Added 190, 191 entries |
| `src/js/config.js` ASSET_ICONS | Added 186, 187, 190, 191 |
| `src/js/config.js` ASSET_CONFIG | Added 186, 187, 190, 191 |
| `AllDapps/app/index.html` ASSET_ICONS | Added 186, 187, 190, 191 |
| `BeamPay/ca_assets_updates.json` | Added 190, 191 entries |
| `memeclash/deploy_tokens.md` | Filled in all AIDs, CID, TX IDs |

## IPFS Logo URLs (Hardcoded Everywhere)

| Token | URL |
|-------|-----|
| CHAD (190) | `https://ipfs.io/ipfs/QmYMksnyN1Cb32jMFkQcjxao3i7XSPL1dWJuHrGXcTr5cx` |
| GIGA (191) | `https://ipfs.io/ipfs/QmZrekbbMSqYNjbkyKM9Ar3k7f6RUW2zUmNv9cxGz8DZvJ` |

## Farcaster Marketing (Planned)

### Concept
- Mirror the X marketing system but on Farcaster
- Create CHAD and GIGA accounts on Farcaster
- Use **free Farcaster API** (no paid access needed unlike X)
- Same content strategy: posts, self-replies, cross-account banter, engagement
- Script choreographed CHAD vs GIGA rivalry conversations
- Engage with other meme communities on Farcaster — let them know about the battle
- Share chart screenshots showing price action and growth

### Chart URLs (for screenshots)
- CHAD: `https://buybeam.my/dashboard/#pair/0_190_2`
- GIGA: `https://buybeam.my/dashboard/#pair/0_191_2`

### Content Strategy
- Same posts as X (reuse from prewarmup_posts.md and ongoing)
- CHAD and GIGA accounts reply to each other (scripted rivalry)
- Screenshot charts during pumps, share with meme communities
- Google/find other meme battles and communities to cross-promote
- Show active participation stats (round results, burn amounts, volume)

### Technical Approach
- Build similar to `scripts/x_marketing/marketing_system.py` but for Farcaster
- Farcaster has free API (Neynar, Hubble, Warpcast API)
- No need for browser automation — direct API calls
- Per-account profiles like X system (chad/giga directories)
- Claude Reply Agent for contextual engagement (same pattern as X)

## Pending Actions

- [ ] Start Round 1 (`start_round`)
- [ ] Start checkpoint daemon
- [ ] Buy proxies for CHAD/GIGA X accounts
- [ ] Create @ChadOnBeam and @GigaOnBeam X accounts
- [ ] Begin 2-week pre-warmup posting (@beampaywallet)
- [ ] Airdrop voucher system development
- [ ] Distribute 100M tokens per team to 80K users
- [ ] Additional treasury deposits each round (3M/team)
- [ ] Build Farcaster marketing system (CHAD + GIGA accounts, free API, chart screenshots)
