# Vendored third-party code

## qrcode.js — qrcode@1.5.1

Vendored rather than loaded from a CDN. The wallet UI shares an origin with the
session token and the JSON-RPC proxy that forwards `tx_send`, so any script that
reaches this origin can spend the wallet. A CDN `<script>` with no SRI hands
that power to whoever controls the CDN, its DNS, or the TLS path — and it also
pings a third party on every launch, which for a privacy wallet is its own leak.

Provenance, verified 2026-08-05:

1. Tarball `https://registry.npmjs.org/qrcode/-/qrcode-1.5.1.tgz`
   sha512 recomputed and matched against npm's published `dist.integrity`:
   `sha512-nS8NJ1Z3md8uTjKtP+SGGhfqmTCs5flU/xR623oI0JX+Wepz9R8UrRVCTBTJm3qGw3rH6jJ6MUHjkDx15cxSSg==`
2. Extracted `package/build/qrcode.js` from that verified tarball.
   sha256: `ba588dfaf738bf8980e5da3b680ab1ce3f205af7577454c16f9c0506fe744df4`

Note: the file previously loaded was jsdelivr's `build/qrcode.min.js`, which
**does not exist in the npm package** — jsdelivr minifies it on the fly. That
file is therefore unverifiable against the publisher, which is why the
unminified `qrcode.js` is vendored instead. The size difference is ~300 bytes.

To update: repeat both steps above with the new version, replace the file, and
update the hashes here. Do not copy from a CDN.
