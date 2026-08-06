#!/usr/bin/env bash
#
# Check that a downloaded release is intact AND came from the maintainer.
#
# Run this from the directory holding the downloaded files:
#
#     ./verify-release.sh
#
# It needs only openssl, which macOS, Linux and Git Bash already have.
#
# Why the signature matters and the checksums alone do not: SHA256SUMS.txt is
# published on the same page as the files, so whoever could swap the files could
# swap the checksums. The signature can only be produced with a private key that
# is not on GitHub, so an attacker who takes over the account cannot forge it.
#
set -euo pipefail

PUBKEY="${1:-release-pubkey.pem}"

if [ ! -f SHA256SUMS.txt ]; then
    echo "SHA256SUMS.txt not found. Download it from the release page."
    exit 1
fi

if [ ! -f "$PUBKEY" ]; then
    echo "Public key not found at: $PUBKEY"
    echo ""
    echo "Get it from the repository, NOT from the release you are checking:"
    echo "  curl -fLO https://raw.githubusercontent.com/vsnation/Beam-Light-Wallet/main/release-pubkey.pem"
    echo ""
    echo "Taking the key from the same place as the files would defeat the point."
    exit 1
fi

echo "1. Is this really from the maintainer?"
if [ ! -f SHA256SUMS.txt.sig ]; then
    echo "   NO SIGNATURE FOUND."
    echo "   Releases before v1.2.2 are unsigned, so this is expected for those."
    echo "   For a signed release, a missing signature means something is wrong."
    SIGNED=0
else
    if openssl pkeyutl -verify -pubin -inkey "$PUBKEY" -rawin \
           -in SHA256SUMS.txt -sigfile SHA256SUMS.txt.sig >/dev/null 2>&1; then
        echo "   OK — signature valid, checksums are genuine."
        SIGNED=1
    else
        echo "   FAILED — the signature does not match."
        echo ""
        echo "   Do not install these files. Either they were tampered with, or"
        echo "   you have the wrong public key. Check the repository."
        exit 1
    fi
fi

echo ""
echo "2. Did the files download intact?"
if shasum -a 256 -c SHA256SUMS.txt 2>/dev/null; then
    echo "   OK — every file present matches."
else
    echo ""
    echo "   A file failed its checksum. Delete it and download again."
    echo "   (Files you did not download are reported as missing; that is fine.)"
    exit 1
fi

echo ""
if [ "$SIGNED" = "1" ]; then
    echo "Verified: genuine and intact."
else
    echo "Intact, but NOT verified as genuine — this release carries no signature."
fi
