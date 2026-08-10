#!/usr/bin/env bash
#
# Does each shipped .dapp actually contain what its source says?
#
# Two things went out wrong at once and neither was caught by anything:
#
#   - airdrop.dapp was built before the voucher-code generator was changed from
#     Math.random() to crypto.getRandomValues(). A voucher code is a bearer key
#     to locked funds, so the packaged copy handed out guessable keys while the
#     repository contained the fix. The source was right; the artifact was a
#     single edit behind, and nothing compared them.
#
#   - memeclash.dapp carried the v8 contract id and v8 asset ids while calling
#     itself v9 in its own header. Every other reference in the tree - the
#     README, serve.py, the wallet's page - had the v9 id. Buying through it
#     spent real BEAM into a deployment abandoned 137 days earlier, and because
#     the shader was ABI-compatible the transaction confirmed rather than failed.
#
# Both are the same class: the packaged artifact is what people install, and
# nothing verified it matched the tree. Run this before publishing one.
#
# Usage: scripts/check_dapp_packages.sh [/path/to/Beam]

set -uo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "  FAIL  $*"; FAIL=1; }
pass() { echo "  ok    $*"; }

echo "Checking .dapp packages under $ROOT"

while IFS= read -r pkg; do
    name="$(basename "$pkg")"
    # Most packages keep their source at app/index.html; beam-screener uses
    # frontend/index.html. Look for whichever exists rather than assuming.
    src="$(dirname "$pkg")/app/index.html"
    [ -f "$src" ] || src="$(dirname "$pkg")/frontend/index.html"
    echo
    echo "$name"

    [ -f "$src" ] || { fail "no app/index.html beside the package"; continue; }

    # 1. The packaged html must be byte-identical to the source it was built from.
    rm -rf "$TMP/x" && mkdir -p "$TMP/x"
    if ! unzip -qo "$pkg" -d "$TMP/x" 2>/dev/null; then
        fail "cannot unzip"; continue
    fi
    if [ ! -f "$TMP/x/app/index.html" ]; then
        fail "package has no app/index.html"; continue
    fi
    if cmp -s "$TMP/x/app/index.html" "$src"; then
        pass "packaged html matches source"
    else
        fail "packaged html DIFFERS from app/index.html - rebuild the package"
    fi

    # 2. Nothing security-critical may be drawn from Math.random.
    #    Matches calls, not the word in a comment.
    if grep -E 'Math\.random\(' "$TMP/x/app/index.html" 2>/dev/null | grep -qvE '^\s*(//|\*|/\*)'; then
        fail "calls Math.random() - if that feeds a code, key or nonce it is guessable"
    else
        pass "no Math.random() calls outside comments"
    fi

    # 3. Every shader in the package must match the one in the tree.
    while IFS= read -r w; do
        rel="${w#$TMP/x/}"
        other="$(dirname "$pkg")/$rel"
        if [ -f "$other" ]; then
            if cmp -s "$w" "$other"; then pass "shader $rel matches"
            else fail "shader $rel differs from the tree"; fi
        fi
    done < <(find "$TMP/x" -name '*.wasm' 2>/dev/null)

    # 4. Contract ids must not disagree with the rest of the repository.
    #    A .dapp pointing at a contract no other file mentions is the memeclash
    #    failure exactly.
    while IFS= read -r cid; do
        hits=$(grep -rl "$cid" "$ROOT" --include='*.js' --include='*.py' --include='*.md' \
                 --exclude-dir=.git --exclude-dir=node_modules 2>/dev/null | wc -l | tr -d ' ')
        if [ "$hits" -eq 0 ]; then
            fail "contract ${cid:0:12}... appears in no other file - is it the live one?"
        else
            pass "contract ${cid:0:12}... corroborated by $hits other file(s)"
        fi
    done < <(grep -oE "_CID = '[a-f0-9]{64}'" "$TMP/x/app/index.html" 2>/dev/null \
             | grep -oE '[a-f0-9]{64}' | sort -u)

done < <(find "$ROOT" -maxdepth 3 -name '*.dapp' -not -path '*/.git/*' 2>/dev/null | sort)

echo
if [ "$FAIL" -eq 0 ]; then echo "All packages agree with their sources."; else echo "Problems found - do not publish."; fi
exit "$FAIL"
