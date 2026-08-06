# Signing releases

## The gap this closes

Every release so far publishes `SHA256SUMS.txt`. That proves a download was not
corrupted in transit. It does **not** prove the files came from the maintainer,
because the checksums sit on the same GitHub release page as the files — anyone
who could replace one could replace the other.

For a wallet, that is the gap that matters. Someone who takes over the GitHub
account, or who gets between a user and github.com, can serve a modified build
and matching checksums, and every documented verification step still passes.

A signature closes it. Verifying needs only the public key, which lives in this
repository and in every previous release. The private key is not on GitHub, so
an attacker who owns the account still cannot produce a valid signature.

This costs nothing. No certificate, no subscription, no authority.

---

## One-time setup (maintainer)

Generate the keypair. **Do this once**, on a machine you trust, and keep the
private key off this repository and off any machine you would not trust with the
wallet itself.

```bash
openssl genpkey -algorithm ed25519 -out ~/.beam-release-key.pem
chmod 600 ~/.beam-release-key.pem

# The public half is meant to be published.
openssl pkey -in ~/.beam-release-key.pem -pubout -out release-pubkey.pem
git add release-pubkey.pem
git commit -m "Add release signing public key"
git push
```

Back up `~/.beam-release-key.pem` somewhere offline. Losing it means users can
no longer verify anything against the published key, and you would have to
publish a new one — which every user has to be told about, through a channel
they already trust. Rotating a signing key is expensive; do not lose it.

The pre-push hook refuses any file matching `*release-key*.pem`, and `.gitignore`
excludes it, but neither is a substitute for keeping it somewhere sensible.

---

## Signing a release

```bash
./scripts/release-sign.sh /path/to/built/artifacts
```

It hashes every artifact into `SHA256SUMS.txt`, signs that one file, and then
**verifies its own signature** against the committed public key before finishing.
A signature that does not verify is worse than none — it looks like protection
while providing none — so the script deletes it and fails rather than emit one.

Upload both `SHA256SUMS.txt` and `SHA256SUMS.txt.sig` with the release.

---

## What users do

```bash
# Get the key from the REPOSITORY, not the release being checked
curl -fLO https://raw.githubusercontent.com/vsnation/Beam-Light-Wallet/main/release-pubkey.pem
curl -fLO https://raw.githubusercontent.com/vsnation/Beam-Light-Wallet/main/scripts/verify-release.sh
chmod +x verify-release.sh
./verify-release.sh
```

Only `openssl` is needed, which macOS, Linux and Git Bash already have. That is
why Ed25519 through openssl was chosen over minisign, which is nicer to use but
is one more thing standing between someone and checking their wallet.

Taking the public key from the same release you are verifying would defeat the
purpose, which is why the instructions point at the repository.

---

## What this does not do

**It is not code signing.** macOS will still say the developer cannot be
verified, and Windows SmartScreen will still warn. Those require a paid
certificate from Apple and a purchased certificate for Windows. This signature
is checked by the user running a command, not by the operating system.

**It does not help someone who never verifies.** Most people will not run the
script. It matters most for anyone downloading a wallet to hold real value, and
it gives anyone who suspects something a way to check.

**It does not protect a compromised signing machine.** If the private key is
taken, signatures can be forged until the key is rotated.
