# UX plan — what is left, in the order it will be done

Built from an audit where every finding was reproduced independently against a
running wallet before it was written down. 23 defects survived verification; two
were refuted and are not listed. Counts below were re-measured today, so this
reflects the code as it stands, not as the audit found it.

Ordered by how many people hit it multiplied by how badly it hurts — not by how
easy it is to fix.

---

## 1. Keyboard and focus (77 controls, measured today)

**77 focusable controls sit inside closed modals.** Tabbing through the wallet
walks into fifteen invisible dialogs, and Enter activates whatever it lands on —
including buttons that spend money. Open modals do not trap focus either, so Tab
leaves the dialog you are looking at and continues into the ones you are not.

The `[hidden]` fix landed earlier does not cover this: closed modals are hidden
by removing an `.active` class, not by the `hidden` attribute.

**Fix:** `inert` on every non-active modal, which removes its whole subtree from
the tab order and from hit-testing in one attribute; a focus trap on the active
one; restore focus to the invoking element on close. `_modalStack` already
exists and knows which dialog is on top.

## 2. Panels that spin forever

Meme Clash shows a permanent spinner when its contract call fails — no error, no
retry, no way back. Fuddle renders fabricated zeros on failure with **Play Now
still enabled**, which is worse: it invents data rather than admitting it has
none. The unlock screen sticks on "Loading wallets…" if the wallet list request
fails, which is the first screen a new user sees.

**Fix:** route all three through `errorState()` with a working retry, as the DEX
and explorer panels now do. Never render a zero that was not measured.

## 3. Things the wallet asserts without checking — DONE

The DEX offers to "Create Pool" for a pool that already exists, and stays wrong
after the pools load. 72 of 400 transactions are labelled "Mint Tokens" purely
because a comment contains the word. An airdrop tile labelled "Total / Claimed"
prints claimed / total. Failed transactions display a network fee that was never
charged. Liquidity rates round to "1 : 0.0000", showing a real price as zero.

**Fix:** each is a claim made without the check behind it. Derive from state, or
say nothing.

## 4. Money confirmations that omit the cost — DONE

The swap confirmation never states the BEAM network fee the swap actually costs
(~0.011 BEAM — measured, not the 0.001 of a transfer). Airdrop batch creation
locks funds on-chain with no confirmation step at all. An amount below one groth
is accepted, rounds to zero, and the confirmation still shows the typed figure.

**Fix:** every screen that commits funds states the total cost including the
network fee, and nothing irreversible happens without a confirmation.

## 5. Touch and zoom (21 inputs, measured today) — DONE

21 visible inputs are under 16px, which makes iOS Safari zoom the page on focus
and leaves it zoomed. The Explorer search box responds to taps on only the
middle 18px of its 57px height. Several primary controls are 18–32px tall
against a 44px minimum.

**Fix:** 16px minimum on inputs (the threshold at which iOS stops zooming),
padding moved from the wrapper onto the field so the whole box is the target.

## 6. Names and contrast (29 + 4, measured today) — DONE

29 icon-only controls have no accessible name; 4 inputs have no programmatic
label. Explorer's Search button computes 2.04:1 — caused by an **undefined CSS
variable**, so the colour silently falls back. Several labels sit between
3.4:1 and 4.4:1 against a 4.5:1 requirement.

**Fix:** `aria-label` on every icon-only control, `for`/`id` on every input, and
the undefined variable defined. Contrast measured after, not assumed.

## 7. Language for people who are not BEAM developers

"groth", "kernel", "shielded", "MaxPrivacy", "UTXO", "LP token" appear with no
explanation. 1,326 addresses show as "Expired" and typed "SBBS" with no hint of
what either means or whether it matters. Errors expose raw RPC text.

**Fix:** plain words, with the jargon in parentheses where the underlying term
still matters.

---

## Not doing, and why

**Real slippage protection.** The confirmation now admits there is none rather
than promising 0.5% that was never sent. Enforcing it means passing a minimum
into the AMM call, which needs the shader's `val1_buy` semantics pinned down
first. Worth doing properly; not worth guessing at with someone's funds.

**A dApp store over IPFS.** Blocked upstream: our binaries are built with
`BEAM_IPFS_SUPPORT=OFF`, so `ipfs_get` answers "Feature is not supported". That
is a rebuild plus a dApp runtime, not a UI task.

**Monero and Firo swaps.** Monero cannot express a hash time-locked contract at
all; Firo could but BEAM ships no bridge. Neither is reachable from the
frontend.
