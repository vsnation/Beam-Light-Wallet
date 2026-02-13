# Fuddle Word Pusher

Push word lists to the Fuddle on-chain contract (BEAM blockchain).

## What's here

```
fuddle_words_push/
  push_words.py     Script to push words to blockchain
  words_4.txt       789 four-letter words
  words_5.txt       735 five-letter words
  words_6.txt       729 six-letter words
  README.md         This file
```

Total: **2,253 words** across 3 difficulty levels.

## Prerequisites

1. **LightWallet running** with wallet unlocked (the admin wallet)
2. **Local node synced** — contract calls don't work on public nodes
3. **Python 3** (no extra packages needed, uses only stdlib)

Start the wallet:
```bash
cd LightWallet
python3 serve.py 9080
# Open http://127.0.0.1:9080 and unlock your wallet
```

## Quick start

### 1. Check what's already on-chain

```bash
python3 push_words.py --check
```

Output:
```
  On-chain word counts:
  Length     On-chain     Local file   Remaining
  ------    --------     ----------   ---------
  4-letter  10           789          779
  5-letter  53           735          682
  6-letter  0            729          729
```

The script **auto-skips** words already on-chain. It matches by count — if 53 five-letter words are on-chain, it skips the first 53 from `words_5.txt` and starts from word #54.

### 2. Push all remaining words

```bash
python3 push_words.py
```

This will:
- Show current counts and ask for confirmation
- Push words in batches of 50 (contract maximum)
- Wait 5 seconds between batches for UTXO availability
- Wait for each transaction to confirm before sending next
- Show progress and final verification

### 3. Push only one word length

```bash
python3 push_words.py --length 5
```

### 4. Preview without sending

```bash
python3 push_words.py --dry-run
```

## All options

| Flag | Default | Description |
|------|---------|-------------|
| `--check` | - | View on-chain counts and exit |
| `--length N` | all | Only push N-letter words (4, 5, or 6) |
| `--batch-size N` | 50 | Words per transaction (max 50) |
| `--skip N` | auto | Skip first N words (overrides auto-skip) |
| `--delay N` | 5 | Seconds to wait between batches |
| `--dry-run` | - | Preview only, don't send transactions |
| `--api URL` | auto | Wallet API URL (auto-detects serve.py or wallet-api) |

## Cost estimate

Each batch of 50 words costs ~0.13 BEAM in fees.

| Words | Batches | Est. fee | Est. time |
|-------|---------|----------|-----------|
| 789 (4-letter) | 16 | ~2.1 BEAM | ~25 min |
| 735 (5-letter) | 15 | ~2.0 BEAM | ~23 min |
| 729 (6-letter) | 15 | ~2.0 BEAM | ~23 min |
| **2,253 total** | **46** | **~6 BEAM** | **~70 min** |

Time depends on `--delay` and blockchain confirmation speed (~60s per block).

## Resuming after failure

If a batch fails (UTXO contention, network issue), the script prints a resume command:

```
    FAILED: ...
    Resume with: --length 5 --skip 200
```

Run it:
```bash
python3 push_words.py --length 5 --skip 200
```

Or just re-run without flags — the auto-skip reads on-chain counts and picks up where it left off.

## Editing word lists

Word files are plain text, one word per line, uppercase:

```
ABOUT
ABOVE
ABUSE
ACTOR
```

Rules:
- Only A-Z letters (no numbers, hyphens, accents)
- One word per line
- All words in a file must be the same length
- Max 50 words per transaction (contract limit)
- Duplicates won't cause errors but waste fees

## How it works

1. Script connects to wallet-api (via serve.py proxy or direct)
2. serve.py automatically injects the `fuddle_app.wasm` shader
3. Words are encoded as uint32 arrays (A=0, B=1, ..., Z=25)
4. `invoke_contract` with `action=add_words` sends them on-chain
5. Contract stores each word with `KeyTag::Internal` (hidden from external reads)
6. Only word **counts** are visible — individual words cannot be read back

## Contract details

- **CID:** `28c52aef751ebe40d611660414dc355db7de4ae76bcc1dab5952537010735808`
- **Max batch:** 50 words per transaction
- **Storage:** Words stored internally, not readable from outside
- **Admin only:** `add_words` requires admin key signature
