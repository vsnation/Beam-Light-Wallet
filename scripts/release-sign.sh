#!/usr/bin/env bash
#
# Sign a release so users can prove it came from the maintainer.
#
# Checksums alone do not do this. SHA256SUMS.txt sits on the same GitHub release
# page as the files it describes, so anyone who could replace the files could
# replace the checksums too. A signature is different: verifying it needs only
# the public key, which lives in this repository and in every previous release,
# so an attacker who takes over the GitHub account still cannot produce one.
#
# Ed25519 via openssl, deliberately: openssl already exists on macOS, Linux and
# Git Bash, so neither signing nor verifying needs anything installed. minisign
# is nicer to use but is one more thing between a user and checking their wallet.
#
# THE PRIVATE KEY MUST BE YOURS AND MUST NOT LIVE IN THIS REPOSITORY.
# Generate it once, keep it offline, and never commit it:
#
#     openssl genpkey -algorithm ed25519 -out ~/.beam-release-key.pem
#     chmod 600 ~/.beam-release-key.pem
#     openssl pkey -in ~/.beam-release-key.pem -pubout -out release-pubkey.pem
#     git add release-pubkey.pem && git commit -m "Add release signing public key"
#
# Then, for each release:
#
#     ./scripts/release-sign.sh /path/to/artifacts
#
set -euo pipefail

ARTIFACT_DIR="${1:-}"
KEY="${BEAM_RELEASE_KEY:-$HOME/.beam-release-key.pem}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBKEY="$REPO_ROOT/release-pubkey.pem"

if [ -z "$ARTIFACT_DIR" ] || [ ! -d "$ARTIFACT_DIR" ]; then
    echo "usage: $0 <artifact-dir>"
    echo "  the directory holding the built release files"
    exit 1
fi

if [ ! -f "$KEY" ]; then
    echo "ERROR: no signing key at $KEY"
    echo ""
    echo "Generate one (once), keep it off this repository:"
    echo "  openssl genpkey -algorithm ed25519 -out $KEY"
    echo "  chmod 600 $KEY"
    echo "  openssl pkey -in $KEY -pubout -out $PUBKEY"
    exit 1
fi

# A world-readable signing key is not a signing key.
PERMS="$(stat -f '%Lp' "$KEY" 2>/dev/null || stat -c '%a' "$KEY" 2>/dev/null || echo '???')"
if [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
    echo "ERROR: $KEY is mode $PERMS; it must be 600 or 400."
    exit 1
fi

cd "$ARTIFACT_DIR"

# Checksums first: the signature covers this one file, and this file covers
# every artifact. One signature, and adding an artifact cannot be forgotten.
echo "Hashing artifacts..."
rm -f SHA256SUMS.txt SHA256SUMS.txt.sig
shopt -s nullglob
FILES=( *.tar.gz *.zip *.dmg *.sh *.exe *.AppImage )
if [ ${#FILES[@]} -eq 0 ]; then
    echo "ERROR: no artifacts found in $ARTIFACT_DIR"
    exit 1
fi
shasum -a 256 "${FILES[@]}" > SHA256SUMS.txt
echo "  $(wc -l < SHA256SUMS.txt | tr -d ' ') artifacts hashed"

echo "Signing SHA256SUMS.txt..."
openssl pkeyutl -sign -inkey "$KEY" -rawin -in SHA256SUMS.txt -out SHA256SUMS.txt.sig

# Never ship a signature without checking it verifies. A signature that does not
# is worse than none: it looks like protection and teaches users to skip the step.
if [ ! -f "$PUBKEY" ]; then
    echo "ERROR: $PUBKEY missing — cannot self-check the signature."
    echo "  openssl pkey -in $KEY -pubout -out $PUBKEY"
    exit 1
fi
if openssl pkeyutl -verify -pubin -inkey "$PUBKEY" -rawin \
       -in SHA256SUMS.txt -sigfile SHA256SUMS.txt.sig >/dev/null 2>&1; then
    echo "  signature verifies against $PUBKEY"
else
    echo "ERROR: the signature does not verify against $PUBKEY."
    echo "  The public key in the repository does not match the signing key."
    rm -f SHA256SUMS.txt.sig
    exit 1
fi

echo ""
echo "Upload BOTH with the release:"
echo "  SHA256SUMS.txt"
echo "  SHA256SUMS.txt.sig"
