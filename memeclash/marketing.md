# MemeClash Marketing Plan

## Table of Contents

1. [Overview](#overview)
2. [Pre-Launch Checklist](#pre-launch-checklist)
3. [X Account Strategy](#x-account-strategy)
4. [Account Warmup Protocol](#account-warmup-protocol)
5. [Airdrop System](#airdrop-system)
6. [Content Strategy](#content-strategy)
7. [Launch Sequence](#launch-sequence)
8. [Post-Launch Operations](#post-launch-operations)
9. [Technical Setup](#technical-setup)
10. [Budget & Resources](#budget--resources)

---

## Overview

**Goal:** Launch MemeClash as the first meme battle game on a privacy blockchain with two competing community factions driving organic engagement.

**Core Strategy:** Two rival X accounts (@ChadOnBeam, @GigaOnBeam) that trash-talk each other, post memes, react to round results, and recruit users for their team. The rivalry IS the marketing. Users pick a side and become evangelists.

**Distribution:** 80,000+ Telegram users get airdrop vouchers. They claim tokens by reaching out (Telegram DM or group) or via broadcast link. Every recipient gets BOTH tokens and picks their side.

**Existing Assets:**
- @beampaywallet (378 followers, battle-tested X marketing system)
- 80,000+ Telegram user database
- Working X automation (Browser Agent + Claude Reply Agent)
- Complete MemeClash smart contract (v8, deployed)
- IPFS logos already uploaded for both tokens

---

## Pre-Launch Checklist

### Before ANYTHING Else

| # | Task | Status | Blocker |
|---|------|--------|---------|
| 1 | Create 2 Gmail accounts (chad, giga) | TODO | None |
| 2 | Create @ChadOnBeam X account | TODO | Gmail |
| 3 | Create @GigaOnBeam X account | TODO | Gmail |
| 4 | Design profile pics (CHAD green laser eyes, GIGA purple brain) | TODO | None |
| 5 | Design banners (battle theme, matching but opposing) | TODO | None |
| 6 | Write bios | TODO | None |
| 7 | Begin 2-week warmup for both accounts | TODO | Accounts created |
| 8 | Deploy new tokens (1B supply, IPFS metadata) | TODO | ~100K BEAM |
| 9 | Create DEX pools (50K BEAM + 350M tokens each) | TODO | Tokens minted |
| 10 | Burn 400M each to BlackHole | TODO | Tokens minted |
| 11 | Deploy new MemeClash contract (v9) | TODO | Pools created |
| 12 | Seed treasuries (150M each) | TODO | Contract deployed |
| 13 | Update frontend code (new AIDs, CID) | TODO | Contract deployed |
| 14 | Prepare airdrop voucher system | TODO | Tokens minted |
| 15 | Prepare Telegram broadcast message | TODO | Voucher system |
| 16 | Create meme template library (20+ memes per team) | TODO | Profile pics |
| 17 | Test full flow end-to-end | TODO | All above |

### Token Deployment Details

| Token | Supply | LP (35%) | Burn (45%) | Treasury (10%) | Airdrop (10%) |
|-------|--------|----------|------------|----------------|---------------|
| $CHAD | 1,000,000,000 | 350,000,000 | 450,000,000 | 100,000,000 | 100,000,000 |
| $GIGA | 1,000,000,000 | 350,000,000 | 450,000,000 | 100,000,000 | 100,000,000 |

**Each pool:** 350M tokens + 50,000 BEAM
**Initial price:** 50,000 / 350,000,000 = 0.0001429 BEAM/token

**Treasury Strategy:** NOT deposited all at once. Gradual injection: 0.3% (3,000,000 tokens) per round per team. This means:
- ~33 rounds of treasury fuel (~11 days at 3 rounds/day)
- Every round has fresh burn fodder
- Creates ongoing "next round matters" narrative
- Treasury wallet holds 100M, deposits 3M before each round via daemon

---

## X Account Strategy

### Three Accounts, Three Roles

| Account | Role | Tone | Posts About |
|---------|------|------|------------|
| @beampaywallet | Neutral referee / ecosystem | Informative, balanced | Round results, burn stats, how-to guides, ecosystem news |
| @ChadOnBeam | Team CHAD mascot | Aggressive, confident, "WAGMI" energy | CHAD wins, GIGA trash talk, green candles, diamond hands |
| @GigaOnBeam | Team GIGA mascot | Galaxy-brain, calculated, smug | GIGA wins, CHAD trash talk, "calculated", 5D chess |

### Account Profiles

**@ChadOnBeam**
```
Display Name: $CHAD
Bio: We don't sell. We don't fold. We burn the opposition.
     $CHAD vs $GIGA every 8h on @beampaywallet
     40% supply burned at launch. Rest is next.
Banner: Green battle arena, CHAD logo, fire effects
Profile Pic: CHAD face with green laser eyes, #25c2a0 tint
Pinned: "What is MemeClash?" explainer thread
```

**@GigaOnBeam**
```
Display Name: $GIGA
Bio: Already 3 moves ahead. Every loss is calculated.
     $CHAD vs $GIGA every 8h on @beampaywallet
     40% supply burned at launch. The math always wins.
Banner: Purple battle arena, GIGA logo, brain energy effects
Profile Pic: GigaChad with glowing purple brain, #a855f7 tint
Pinned: "Why GIGA wins" strategy thread
```

### The Banter Loop (Core Mechanic)

The two accounts publicly argue on X. This is NOT scripted — it looks like two communities trash-talking. Real users join the conversation and pick sides.

**Daily Banter Pattern:**
```
@ChadOnBeam: "Round 47 incoming. GIGA treasury looking thin.
              Last time they led, we came back with a 3x burn.
              Green candles only."

@GigaOnBeam: "CHAD talking about one round like it's a war.
              Check the lifetime stats. GIGA burns have been
              larger 60% of the time. Calculated."

@ChadOnBeam: "@GigaOnBeam cope harder. Your 'strategy' is
              literally just hoping we don't show up."

Random user: "lmao which one do I buy"

@ChadOnBeam: "The one that doesn't need a spreadsheet to
              feel confident"

@GigaOnBeam: "@RandomUser the one that actually wins.
              Check the scoreboard."
```

**Rules for Banter:**
1. NEVER be mean to users — only trash-talk each other
2. Always welcome new users warmly regardless of which team they ask about
3. Include real stats when possible (treasury sizes, burn totals, round scores)
4. Keep it playful, never genuinely hostile
5. React to EVERY round result within 30 minutes
6. Tag each other at least 3x per day (drives cross-follower discovery)

### Cross-Account Interaction Schedule

| Time | CHAD Posts | GIGA Posts | @beampaywallet |
|------|-----------|-----------|----------------|
| Round Start | "Let's go. Loading treasury." | "Another round, another lesson for CHAD." | "Round #{N} is LIVE. 8 hours on the clock." |
| Mid-Round | Power bar screenshot + hype | Counter-analysis, "wait for it" | Stats update (optional) |
| Round End (CHAD wins) | "GET IN. Another one. BURNED." | "GG. We'll be back. Treasury reloading." | "Round #{N}: $CHAD wins. {X} tokens burned." |
| Round End (GIGA wins) | "One round. Reload. We're fine." | "As predicted. Calculated perfection." | "Round #{N}: $GIGA wins. {X} tokens burned." |
| Round End (Draw) | "Both burned. Tie goes to the strong." | "Both burned. Math doesn't lie." | "Round #{N}: Draw. Both treasuries burned." |

---

## Account Warmup Protocol

**CRITICAL: New X accounts that immediately start marketing get suspended. 2-week minimum warmup required.**

### Week 1: Human Behavior (Days 1-7)

Both accounts act like normal humans discovering crypto. NO MemeClash mentions.

**Day 1-2: Setup**
- Complete profile (pic, banner, bio — use generic crypto bio first)
- Follow 20-30 accounts: crypto news, meme accounts, privacy projects
- Like 10-15 posts (genuine engagement, not just privacy)
- Post 1 intro tweet: "new here. been lurking crypto twitter for a while. time to join."
- Scroll home feed for 15+ minutes (build normal usage patterns)

**Day 3-4: Start Engaging**
- Reply to 5-8 posts per day (genuine reactions, 2-3 sentences)
- Like 15-20 posts (mix of topics)
- Follow 15-20 more accounts
- Post 1 original thought about crypto (NOT about Beam/MemeClash)
- Retweet 2-3 interesting posts

**Day 5-7: Build Presence**
- Reply to 10-15 posts per day
- Like 20-25 posts
- Post 2 original tweets per day
- Start following meme coin accounts, crypto gaming accounts
- Begin light personality: CHAD account starts showing "WAGMI" energy, GIGA starts showing "calculated" vibes
- Follow each other (but don't interact yet)

### Week 2: Personality Development (Days 8-14)

Accounts develop their characters. Light MemeClash teasers.

**Day 8-10: Character Emerges**
- Update bios to final versions
- CHAD starts posting about "diamond hands", "we don't sell" content
- GIGA starts posting about "strategy > brute force", "IQ > emotion"
- Reply to each other for the first time (friendly banter, not about MemeClash)
- 15-20 replies per day, 25-30 likes
- Post 2-3 original tweets per day

**Day 11-12: Teaser Phase**
- Both accounts hint at "something coming"
- CHAD: "what if meme tokens actually burned each other? asking for a friend."
- GIGA: "been looking at on-chain meme games. most are mid. one isn't."
- Light engagement with meme coin communities
- First interaction with @beampaywallet (like/reply to a post)

**Day 13-14: Pre-Launch Hype**
- Both accounts reveal they're rivals: first public banter exchange
- CHAD: "ok @GigaOnBeam let's settle this on-chain. 8 hours. loser burns."
- GIGA: "finally someone with enough confidence to lose publicly. see you there."
- @beampaywallet quote-tweets with: "Round 1 is coming. Pick your side."
- Announce launch date
- Pin explainer threads

### Automation Setup for Warmup

Use the existing X marketing system architecture. Each account gets its own Browser Agent instance:

```bash
# CHAD account
cd scripts/x_marketing
python3 marketing_system.py --profile=chad --mode=full_ai

# GIGA account (different Chrome profile, different port)
python3 marketing_system.py --profile=giga --mode=full_ai
```

**Warmup-specific config:**
```python
# Week 1 limits (very conservative)
WARMUP_WEEK1 = {
    'max_replies_per_day': 10,
    'max_likes_per_day': 20,
    'max_follows_per_day': 25,
    'max_posts_per_day': 2,
    'min_cycle_wait': 300,  # 5 min between actions
}

# Week 2 limits (ramping up)
WARMUP_WEEK2 = {
    'max_replies_per_day': 20,
    'max_likes_per_day': 35,
    'max_follows_per_day': 15,
    'max_posts_per_day': 3,
    'min_cycle_wait': 180,  # 3 min between actions
}
```

---

## Airdrop System

### Overview

**100M tokens per team (10% of supply) = 200M total airdrop tokens.**

Every recipient gets BOTH $CHAD and $GIGA. They choose their team by selling one (or hold both). This ensures both pools get initial liquidity and forces engagement.

### Distribution Tiers

| Tier | Recipients | CHAD per person | GIGA per person | Total CHAD | Total GIGA | Channel |
|------|-----------|----------------|----------------|------------|------------|---------|
| Community | 80,000 | 1,000 | 1,000 | 80,000,000 | 80,000,000 | Telegram broadcast |
| KOL | 100 | 100,000 | 100,000 | 10,000,000 | 10,000,000 | Personal DM |
| Early Supporters | 200 | 50,000 | 50,000 | 10,000,000 | 10,000,000 | Manual / Telegram |

**Value at launch (per tier):**
- Community: 1,000 tokens = 0.143 BEAM (~$0.71 at $5/BEAM) per token, per person
- KOL: 100,000 tokens = 14.3 BEAM (~$71.50) per token, per person
- Early Supporters: 50,000 tokens = 7.14 BEAM (~$35.70) per token, per person

### Voucher System

Airdrop uses a **voucher code** model. Users don't need a wallet to "claim" — they receive a unique code and redeem it when ready.

**How It Works:**

```
1. We generate voucher codes (unique alphanumeric strings)
2. Each code is tied to a token amount (CHAD + GIGA)
3. Codes are distributed via:
   - Telegram broadcast to 80K users
   - Personal DM to KOLs
   - Handed out in Telegram groups / X replies
4. User opens BeamPay wallet (or Light Wallet)
5. User enters voucher code → tokens sent to their wallet
6. Voucher marked as redeemed (one-time use)
```

**Voucher Format:**
```
CHAD-XXXX-XXXX-XXXX    (e.g., CHAD-A7K9-M2PL-X4QR)
GIGA-XXXX-XXXX-XXXX    (e.g., GIGA-B3N8-R5WZ-Y1JT)
```

Each person gets a pair (one CHAD voucher + one GIGA voucher). Codes are case-insensitive, 12 random alphanumeric characters.

### Telegram Broadcast Plan

**Database:** 80,000+ users from BeamPay Telegram bot

**Broadcast Message (English):**
```
MemeClash is LIVE on BEAM

Two meme tokens battle every 8 hours. Loser gets burned. Supply only goes down.

You're getting a FREE airdrop of BOTH tokens:
  $CHAD: 1,000 tokens
  $GIGA: 1,000 tokens

Pick your team. Sell the other. Or hold both.

Redeem your tokens:
  CHAD code: CHAD-XXXX-XXXX-XXXX
  GIGA code: GIGA-XXXX-XXXX-XXXX

How to claim:
  1. Open your BeamPay wallet
  2. Go to Settings > Redeem Voucher
  3. Enter your codes
  4. Tokens arrive instantly

Battle page: [link]
What is MemeClash: [link]

40% of total supply was burned at launch. Every round burns more.
First meme battle on a privacy blockchain.
```

**Broadcast in batches:**
- 10,000 users per batch (avoid Telegram rate limits)
- 30-minute gaps between batches
- 8 batches over 4 hours
- Track delivery rate, open rate, redemption rate

### Voucher Redemption Backend

**New endpoint in serve.py (or BeamPay API):**

```
POST /api/voucher/redeem
{
    "code": "CHAD-A7K9-M2PL-X4QR",
    "address": "user_beam_address"
}

Response:
{
    "success": true,
    "token": "CHAD",
    "amount": 1000,
    "txId": "abc123..."
}
```

**Database (MongoDB):**
```javascript
// vouchers collection
{
    code: "CHAD-A7K9-M2PL-X4QR",
    token: "CHAD",              // or "GIGA"
    amount: 100000000000,       // 1000 tokens in groth (1000 * 1e8)
    tier: "community",          // "community", "kol", "early_supporter"
    pair_code: "GIGA-B3N8-R5WZ-Y1JT",  // paired voucher
    telegram_user_id: 12345678,
    created_at: ISODate,
    redeemed: false,
    redeemed_at: null,
    redeemed_address: null,
    redeemed_tx_id: null
}
```

### Voucher Generation Script

```python
# scripts/generate_vouchers.py
# Generates paired voucher codes for airdrop
# Input: Telegram user IDs from database
# Output: vouchers.json + per-user messages for broadcast

# Run BEFORE broadcast
python3 scripts/generate_vouchers.py \
    --community-amount=1000 \
    --kol-file=kol_list.csv \
    --kol-amount=100000 \
    --output=vouchers.json
```

### Anti-Abuse

- One voucher pair per Telegram user ID
- Voucher expires after 30 days
- Rate limit: max 10 redemptions per minute per IP
- Each code is single-use (redeemed flag)
- Monitoring dashboard tracks redemption rate by tier

---

## Content Strategy

### Content Pillars

| Pillar | % of Posts | Examples | Who Posts |
|--------|-----------|----------|-----------|
| Battle Drama | 40% | Round results, trash talk, power bars, "who's winning" | CHAD, GIGA |
| Memes | 25% | Chad vs Giga memes, burn memes, "my portfolio" memes | CHAD, GIGA |
| Education | 15% | How burns work, how to buy, how pools work, privacy angle | @beampaywallet |
| Stats & Burns | 10% | Lifetime burns, volume, round history, deflationary proof | @beampaywallet |
| Community | 10% | User highlights, new player welcomes, poll ("who wins next?") | All three |

### Meme Templates Needed (Pre-Launch)

Create 20+ meme templates per team before launch:

**CHAD Memes:**
1. Drake format: "selling when red" (no) / "buying more CHAD" (yes)
2. Gigachad walking meme but it's CHAD leaving GIGA in dust
3. "They said CHAD was done" → "round 48 winner: CHAD"
4. Burning house meme: "GIGA treasury" with fire
5. Stonks meme with CHAD face
6. "We are not the same" — CHAD vs paper hands
7. "Tell me you're CHAD without telling me" format
8. Green laser eyes edit on famous figures
9. Treasury loading bar at 99%
10. "CHAD holders watching GIGA burn" popcorn meme

**GIGA Memes:**
1. Galaxy brain expanding: "hold" → "hold both" → "GIGA only" → "GIGA + LP"
2. Chess grandmaster but it's GIGA playing CHAD at checkers
3. "Calculated." with smug GIGA face over burn stats
4. "CHAD thinks one round matters. GIGA plays the long game."
5. Math equations floating around GIGA's head
6. Purple brain energy radiating off charts
7. "While CHAD was celebrating, GIGA was already planning round 49"
8. Calm GIGA vs panicking CHAD during red rounds
9. "You wouldn't understand. It's a GIGA thing."
10. Venn diagram: CHAD (brute force) vs GIGA (4D chess) overlap: (both get burned)

**Neutral/Shared Memes:**
1. Burn counter ticking up (animated GIF)
2. "40% burned at launch. The rest is next."
3. Side-by-side power bar with real stats
4. "First meme battle on a privacy chain" educational infographic
5. Round result card template (reusable every 8h)

### Video Content Plan

| Video | Duration | Purpose | Priority |
|-------|----------|---------|----------|
| "MemeClash in 60 seconds" explainer | 60s | Onboarding | HIGH — Day 1 |
| "How to buy $CHAD / $GIGA" tutorial | 90s | Conversion | HIGH — Day 1 |
| Animated round result template | 15s | Recurring | HIGH — pre-launch |
| "The Great Burn" — launch day supply destruction | 30s | Hype | MEDIUM — Launch |
| Weekly recap compilation | 2-3min | Retention | LOW — Week 2+ |

### Hashtag Policy

**NEVER use hashtags.** Same rule as @beampaywallet. Content stands on its own. Hashtags signal bot accounts.

---

## Launch Sequence

### T-7 Days: Final Prep

- [ ] Both X accounts warmed up (14+ days old, 50+ followers each)
- [ ] Meme library ready (20+ per team)
- [ ] Explainer thread drafted for all 3 accounts
- [ ] Telegram broadcast message approved
- [ ] Voucher codes generated for all 80K users
- [ ] Redemption backend tested end-to-end
- [ ] New tokens deployed on mainnet
- [ ] DEX pools created and seeded
- [ ] 400M burned to BlackHole (verifiable on explorer)
- [ ] Contract deployed with new token AIDs
- [ ] Treasuries seeded (150M each)
- [ ] Frontend updated and tested

### T-3 Days: Teaser Campaign

**Day -3:**
- @ChadOnBeam: "something big is coming. 8 hours changes everything."
- @GigaOnBeam: "been waiting for this. the math is about to speak."
- @beampaywallet: "Announcement in 3 days."

**Day -2:**
- @ChadOnBeam posts CHAD logo with "SOON"
- @GigaOnBeam posts GIGA logo with "CALCULATED"
- First banter exchange: CHAD and GIGA quote-tweet each other
- @beampaywallet: "Two tokens. One arena. 8-hour rounds. More details tomorrow."

**Day -1:**
- All three accounts post explainer threads (pinned)
- @beampaywallet: Full announcement with tokenomics, burn proof, how to play
- @ChadOnBeam: "War thread" — why CHAD wins, token stats, call to action
- @GigaOnBeam: "Strategy thread" — why GIGA wins, math breakdown, call to action
- Cross-tagging begins: all three accounts interact on each thread

### Launch Day (T=0)

**Hour 0: Token Live**
```
@beampaywallet:
"MemeClash is LIVE.

$CHAD vs $GIGA. Battle every 8 hours. Loser burns.

40% of supply burned at launch. 15% in the battle treasury.

Airdrop going out to 80,000 users now.

Round 1 starts in [X] hours. Pick your team."
```

```
@ChadOnBeam:
"IT'S TIME.

$CHAD is live. 400 million tokens already burned.
the rest of GIGA is next.

buy $CHAD directly from the battle page. no dex needed.
round 1 starts soon. we're ready."
```

```
@GigaOnBeam:
"Calculations complete. $GIGA is live.

400M burned at launch. 150M in the treasury.
every round makes us scarcer.

chad thinks they're ready. they're not.
round 1 begins shortly."
```

**Hour 0-1: Telegram Broadcast**
- Send airdrop vouchers to all 80K users in batches
- Monitor redemption rate
- Support team ready in Telegram group for questions

**Hour 1-8: Round 1 Active**
- Both accounts post updates as round progresses
- @beampaywallet posts mid-round stats
- Engage with every user who tweets about MemeClash
- Reply to airdrop questions on Telegram

**Hour 8: First Round Result**
- All three accounts react to result
- Winner account celebrates, loser account plots revenge
- @beampaywallet posts burn stats
- "Round 2 starts NOW" — keep momentum

### T+1 to T+7: First Week

- 3 round results per day = 3 content cycles per day
- Both team accounts banter after every round
- @beampaywallet posts daily burn recap
- Track and share milestones: first 1M burned, first 10M burned, etc.
- Engage with every mention and quote tweet
- KOL DMs begin (personalized, mention their content)

---

## Post-Launch Operations

### Daily Automation (3 Round Cycles)

Each round cycle triggers content from all three accounts:

```python
# Automated round result posting
# Checkpoint daemon already runs the contract settlement
# Add webhook to trigger X posts after each checkpoint

def on_round_complete(round_data):
    winner = round_data['winner']  # 'chad' or 'giga' or 'draw'
    burned = round_data['tokens_burned']

    # Queue posts to all 3 accounts
    post_to_beampaywallet(round_summary(round_data))
    post_to_winner_account(celebration(round_data))
    post_to_loser_account(revenge_tease(round_data))

    # Queue banter between CHAD and GIGA
    schedule_banter(winner, round_data, delay=random(5, 30))
```

### Weekly Content Calendar

| Day | CHAD | GIGA | @beampaywallet |
|-----|------|------|----------------|
| Mon | "Week starts. Loading." | "Monday analysis thread" | Weekly burn recap |
| Tue | Meme day (2-3 memes) | Counter-meme | "How burns work" educational |
| Wed | Mid-week hype | "Calculated mid-week" | Stats infographic |
| Thu | Throwback to best win | "Remember when CHAD thought..." | Community highlight |
| Fri | "Weekend warriors incoming" | "Weekend = more data" | Poll: "Who wins this weekend?" |
| Sat | Peak banter day | Peak counter-banter | Retweet best community posts |
| Sun | "CHAD never rests" | Weekly strategy analysis | Weekly summary thread |

### Metrics to Track

| Metric | Target (Month 1) | Target (Month 3) |
|--------|-------------------|-------------------|
| @ChadOnBeam followers | 500 | 3,000 |
| @GigaOnBeam followers | 500 | 3,000 |
| @beampaywallet followers | 700 | 5,000 |
| Daily round tweets impressions | 10K | 100K |
| Voucher redemption rate | 5% (4,000) | 15% (12,000) |
| Active MemeClash traders | 50 | 500 |
| Daily BEAM volume (MemeClash) | 500 | 10,000 |
| Memes created by community | 5/week | 50/week |

### Engagement Escalation

**Month 1:** Build awareness. Focus on explaining what MemeClash is.
**Month 2:** Build rivalry. Lean into CHAD vs GIGA drama. Community meme contests.
**Month 3:** Build economy. Show burn stats, price impact, earning potential (LP fees, caller rewards).

---

## Technical Setup

### Chrome Profiles (3 Accounts)

Each X account needs its own Chrome profile to avoid detection:

```bash
# Create separate Chrome profiles
mkdir -p ~/Library/Application\ Support/Google/Chrome-CHAD
mkdir -p ~/Library/Application\ Support/Google/Chrome-GIGA

# Each profile logged into its respective Gmail/X account
```

### Automation Architecture (3 Instances)

```
┌────────────────────────────────────────────────────────────────────────┐
│                    @beampaywallet (existing)                           │
│  Browser Agent → pending_replies.json → Claude Reply Agent            │
│  Profile: default Chrome                                               │
│  Focus: privacy advocacy, ecosystem news, neutral MemeClash updates   │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                    @ChadOnBeam (new)                                   │
│  Browser Agent → pending_replies_chad.json → Claude Reply Agent       │
│  Profile: Chrome-CHAD                                                  │
│  Focus: CHAD hype, GIGA trash talk, meme posting, round reactions     │
│  Search queries: "$CHAD", "$GIGA", "memeclash", meme coin topics      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                    @GigaOnBeam (new)                                   │
│  Browser Agent → pending_replies_giga.json → Claude Reply Agent       │
│  Profile: Chrome-GIGA                                                  │
│  Focus: GIGA strategy, CHAD trash talk, meme posting, round reactions │
│  Search queries: "$GIGA", "$CHAD", "memeclash", meme coin topics      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                    Banter Coordinator (new)                            │
│  Reads round results from checkpoint daemon                           │
│  Generates cross-account banter scripts                               │
│  Queues posts to both CHAD and GIGA accounts                         │
│  Ensures natural timing (2-15 min between exchanges)                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Reply Agent Personality Prompts

**CHAD Reply Agent — FOR_CLAUDE_CHAD.md:**
```
You are @ChadOnBeam — the voice of Team CHAD in MemeClash.

PERSONALITY:
- Confident, aggressive optimist, diamond hands energy
- You believe CHAD always wins. When CHAD loses, it's a setup for the next win.
- You trash-talk GIGA (playfully, never mean to actual users)
- "WAGMI", "green candles only", "we don't sell", "diamond hands"
- Short, punchy, high-energy tweets

RULES:
- WELCOME all new users warmly, even if they pick GIGA
- NEVER be rude to real users — only banter with @GigaOnBeam
- When CHAD wins: celebrate hard, tag @GigaOnBeam
- When CHAD loses: "one round means nothing. reload."
- Include real stats when available (treasury, burns, rounds won)
- ~50% of replies mention CHAD/MemeClash, 50% are general meme coin vibes
- Match poster's energy. Professional with professionals, degen with degens.
```

**GIGA Reply Agent — FOR_CLAUDE_GIGA.md:**
```
You are @GigaOnBeam — the voice of Team GIGA in MemeClash.

PERSONALITY:
- Calm, calculated, galaxy-brain strategist
- You believe GIGA wins through superior strategy, not brute force
- You trash-talk CHAD (playfully, they're "emotional traders")
- "Calculated.", "Already priced in", "5D chess", "This is the way"
- Measured, slightly smug tweets. Let the numbers speak.

RULES:
- WELCOME all new users warmly, even if they pick CHAD
- NEVER be rude to real users — only banter with @ChadOnBeam
- When GIGA wins: "as predicted. the math always wins."
- When GIGA loses: "short-term noise. check the lifetime stats."
- Include real stats when available (treasury, burns, win rate)
- ~50% of replies mention GIGA/MemeClash, 50% are general meme coin vibes
- Match poster's energy. Professional with professionals, degen with degens.
```

### Banter Coordinator Script

```python
# scripts/memeclash_banter.py
# Generates and queues cross-account banter after each round

# Triggered by checkpoint daemon webhook
# Reads round result
# Generates 2-4 exchange pairs (CHAD says X, GIGA replies Y)
# Queues to respective pending files with staggered timestamps
# Delays: 2-15 min between exchanges to look organic
```

### Voucher Redemption Infrastructure

**New files needed:**
```
scripts/
  generate_vouchers.py        # Generate codes, insert into MongoDB
  voucher_api.py              # FastAPI redemption endpoint
  broadcast_airdrop.py        # Telegram broadcast sender

# Or integrate into existing BeamPay API
```

**Telegram Broadcast Script:**
```python
# scripts/broadcast_airdrop.py
# Reads voucher pairs from MongoDB
# Sends personalized messages to each Telegram user
# Tracks delivery/read status
# Handles rate limits (30 messages/second Telegram limit)
# Retry failed deliveries
```

---

## Budget & Resources

### BEAM Required

| Item | BEAM | Notes |
|------|------|-------|
| Create CHAD token (Minter) | 60 | One-time |
| Create GIGA token (Minter) | 60 | One-time |
| CHAD/BEAM LP pool | 50,000 | 350M tokens + 50K BEAM |
| GIGA/BEAM LP pool | 50,000 | 350M tokens + 50K BEAM |
| Deploy MemeClash contract | ~0.2 | One-time |
| BlackHole burns (45% × 2) | ~0.02 | 2 transactions, 450M each |
| Treasury deposits (ongoing) | ~0.33/round | 3M tokens/round/team, ~33 rounds |
| Airdrop distribution TX fees | ~100 | ~80K transactions × 0.001 BEAM fee |
| Misc TX fees | ~5 | Pool creates, mints, etc. |
| **Total** | **~100,225 BEAM** | |

### Time Required

| Phase | Duration | People |
|-------|----------|--------|
| Account creation + profile setup | 1 day | 1 |
| Meme library creation | 2-3 days | 1 (design) |
| Account warmup | 14 days | Automated |
| Token deployment + pool setup | 1 day | 1 (dev) |
| Voucher system development | 2-3 days | 1 (dev) |
| Banter coordinator script | 1-2 days | 1 (dev) |
| Frontend updates | 1 day | 1 (dev) |
| Testing full flow | 1-2 days | 1 |
| **Total calendar time** | **~3 weeks** | (warmup is the bottleneck) |

### Ongoing Operational Cost

| Item | Monthly | Notes |
|------|---------|-------|
| Checkpoint daemon server | $20 | VPS for running rounds |
| X Premium (×2 accounts) | $16 | Blue check increases reach |
| Claude API (reply generation) | ~$30 | 3 accounts × ~1000 replies/month |
| Meme creation tools | $0-20 | Canva/Midjourney optional |
| **Total monthly** | **~$66-86** | |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| X suspends new accounts | 2-week warmup, conservative rate limits, real Chrome profiles |
| Low airdrop redemption | Follow-up broadcast after 7 days, Telegram group reminders |
| One team dominates (lopsided) | Marketing push for underdog, balanced banter, treasury seeding |
| Users confused by mechanics | Pinned explainer threads, video tutorial, Telegram support |
| Bot detection on banter | Vary timing (2-15 min gaps), vary length, genuine engagement mixed in |
| Token price crashes | Both tokens are deflationary — burn stats are the narrative, not price |
| Low initial volume | Treasury seed provides first burns even with zero user activity |

---

## Summary: What To Build Before Launch

### Code (Dev work)

1. **Voucher generation script** — `scripts/generate_vouchers.py`
2. **Voucher redemption API** — endpoint in BeamPay or serve.py
3. **Telegram broadcast script** — `scripts/broadcast_airdrop.py`
4. **Banter coordinator** — `scripts/memeclash_banter.py`
5. **CHAD Browser Agent config** — Chrome profile + search queries + personality
6. **GIGA Browser Agent config** — Chrome profile + search queries + personality
7. **Round result webhook** — checkpoint daemon triggers X posts
8. **Frontend: voucher redemption UI** — "Redeem Voucher" in wallet settings

### Content (Creative work)

1. **CHAD profile pic + banner** — green laser eyes theme
2. **GIGA profile pic + banner** — purple brain energy theme
3. **20+ CHAD memes** — template library
4. **20+ GIGA memes** — template library
5. **Round result card template** — reusable graphic
6. **"MemeClash in 60 seconds" video** — explainer
7. **"How to buy" video** — tutorial
8. **Explainer threads** — one per account (3 total)
9. **Telegram broadcast message** — multilingual (EN, RU, KO, JA)

### Accounts (Manual setup)

1. **Gmail for CHAD** — fresh account
2. **Gmail for GIGA** — fresh account
3. **@ChadOnBeam X account** — created, profiled, warmed up
4. **@GigaOnBeam X account** — created, profiled, warmed up
5. **(Optional) X Premium** — for both accounts after warmup

### On-Chain (Deployment)

1. **New CHAD token** — 1B supply, IPFS metadata
2. **New GIGA token** — 1B supply, IPFS metadata
3. **CHAD/BEAM DEX pool** — 350M + 50K BEAM
4. **GIGA/BEAM DEX pool** — 350M + 50K BEAM
5. **BlackHole burns** — 400M each
6. **MemeClash v9 contract** — new token AIDs
7. **Treasury seed** — 150M each
8. **Airdrop wallet** — 100M each for voucher distribution
