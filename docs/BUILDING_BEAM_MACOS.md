# Building BEAM binaries for macOS

BeamMW has published no macOS build since **7.5.13882 (2024-05-25)** and shipped
no mac asset for the **7.5.14493** HF6 hotfix. That build stalls forever one
block before the fork at 3,928,665, which is why every macOS install silently
fell out of consensus on 2026-06-30.

BEAM is open source, so we build it ourselves. This is a permanent
responsibility, not a one-off — upstream is not on the critical path any more.

Verified on macOS 15.6.1, Apple Silicon, 2026-08-04.

---

## Result

| binary | size | sha256 |
|---|---|---|
| `wallet-api` | 7.9 MB | `102f28256c01cfa37243c1b79564283e3f0ab8ead3d153c67f8ca5dd6117b624` |
| `beam-node`  | 13 MB  | `d5aadc3f3758f1ff9bd433915c08d0e81c9388b11b84ec94d0f7eade2adb5a57` |

Proof it works — this binary against a public node, no local node:

```
Rules signature: network=mainnet
    3928666-96df3f33ee02ad9e          <- HF6 present
Sync up to 3978239-2a528d50c3429fe4
wallet_status: height 3978239, is_in_sync true, tip 1 min old
```

The shipped 7.5.13882 binary against the same node reports height 3928665,
`is_in_sync false`, and a tip 34 days old.

---

## Prerequisites

```bash
brew install cmake boost openssl@3 librsvg   # librsvg only for the app icon
```

Xcode Command Line Tools provide clang. No Xcode.app needed.

## Build

```bash
git init beamsrc && cd beamsrc
git remote add origin https://github.com/BeamMW/beam.git
git fetch --depth 1 origin tag beam-7.5.14493
git checkout beam-7.5.14493

# Only these two submodules are needed for the configuration below.
git submodule update --init --depth 1 3rdparty/secp256k1
git submodule update --init --depth 1 3rdparty/re2

# See "Gotchas" — this is not optional.
sed -i '' 's/-Wall -Werror -pthread/-Wall -pthread/' CMakeLists.txt

export OPENSSL_ROOT_DIR=$(brew --prefix openssl@3)
export BOOST_ROOT=$(brew --prefix boost)

cmake -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DBEAM_IPFS_SUPPORT=OFF \
  -DBEAM_LASER_SUPPORT=OFF \
  -DBEAM_TESTS_ENABLED=OFF \
  -DBEAM_HW_WALLET=OFF \
  -DOPENSSL_ROOT_DIR="$OPENSSL_ROOT_DIR" \
  -DBOOST_ROOT="$BOOST_ROOT"

cmake --build build --target wallet-api beam-node beam-wallet -j $(sysctl -n hw.ncpu)
```

Artifacts land at `build/wallet/api/wallet-api`, `build/beam/beam-node`,
`build/wallet/cli/beam-wallet`.

## Verify before shipping

Always confirm the fork is compiled in and the binary reaches the real tip:

```bash
grep -n 'pForks\[6\].m_Height' core/block_crypt.cpp     # must be 3928666

printf 'pass=YOURPASS\n' > /tmp/w.cfg && chmod 600 /tmp/w.cfg
build/wallet/api/wallet-api --wallet_path=some/wallet.db --config_file=/tmp/w.cfg \
    --node_addr=eu-node01.mainnet.beam.mw:8100 --port=10003 --use_http=1 --enable_assets
# log must print  "3928666-96df3f33ee02ad9e"  in the Rules signature
# wallet_status must return is_in_sync true and a height within a few of
# https://explorer.0xmx.net/api/status
```

Then update `config/binaries.json`: set `macos.beam_version`, flip
`hf6_compatible` to `true`, and pin the sha256 of each extracted binary.

---

## Gotchas, all of which cost real time

**`-Werror` breaks the build on current clang.** BEAM sets `-Wall -Werror`
globally. Apple clang 17 warns `unused-private-field` on `_broadcastRouter` in
`wallet/api/cli/api_cli.cpp`, `-Werror` turns that into an error, the class is
marked invalid, and clang then emits six confusing cascade errors ending in
*"no matching constructor ... no known conversion from WalletApiServer to
IWalletApiServer&"*. The base class is fine; the message is a red herring.
Drop `-Werror`.

**Do not mix the swap flags.** `BEAM_ASSET_SWAP_SUPPORT` and
`BEAM_ATOMIC_SWAP_SUPPORT` are not independent, though CMake presents them that
way:

- ASSET=ON, ATOMIC=OFF → `api_cli.cpp` fails: `BroadcastRouter` is used under
  the asset-swap guard but only *included* under the atomic-swap one.
- ASSET=OFF → `wallet/cli/cli.cpp` fails: `AssetsSwapList` and the
  `kAssetsSwap*` strings are not guarded at all.

Leave both at their ON defaults.

**re2 must be static.** BEAM compiles everything with `-fvisibility=hidden`. If
re2 builds as a shared library it exports **nothing** — `nm -gU libre2.dylib |
grep RE2` returns zero matches — and `wallet-api` fails to link with *"Undefined
symbols: re2::RE2::~RE2()"* even though the dylib is on the link line. Use
`-DBUILD_SHARED_LIBS=OFF`.

**Missing submodule shows as a cmake error, not a nice message.**
`3rdparty/re2 does not contain a CMakeLists.txt file` just means the submodule
was never initialised.

---

## Distribution

These are unsigned. Per `docs/PACKAGING.md`, sign ad-hoc (`codesign -s - --deep`),
publish as release assets alongside the app, and pin their hashes in
`config/binaries.json` so every installer verifies them before use. Notarisation
needs the $99 Apple Developer Program and is not required for the binaries to
work — the installer's SHA-256 check is what protects users.
