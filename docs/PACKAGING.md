# Packaging, distribution and updates

Constraint this document is written under: **no paid accounts, no subscriptions.**
Everything below is free. Where a paid option would genuinely help it is named at
the end, but nothing here depends on it.

---

## 1. The update threat model — read this first

An updater that fetches and executes remote code *without the user approving it*
is a supply-chain backdoor into every wallet that ships it. Whoever controls the
source — including anyone who compromises the GitHub account, a maintainer's
laptop, or a CI token — executes arbitrary code next to the user's keys. For a
wallet, that is the single highest-value target in the whole product.

Three rules, in order of importance:

1. **Never automatic.** The user approves each update explicitly, every time.
   "Approved once" must never mean "apply all future ones".
2. **Never branch HEAD.** Only a tagged, immutable artifact.
3. **Verify before writing.** Check the signature *before* anything touches
   disk, and refuse on mismatch. Never fall back to "install it anyway".

### What was there before

Three separate update channels, none of which met any of the three rules:

| Where | What it did |
|---|---|
| `build/macos/create-dmg.sh` | curl `main.tar.gz`, overwrite `serve.py`, `src/`, `config/`, `shaders/` **inside the app bundle** |
| `macos_install.sh` / `linux_install.sh` | `git reset --hard origin/main` on **every launch**, no prompt |
| `serve.py` `POST /api/update` | `git pull origin main` then re-exec — and reachable cross-origin, so any web page could trigger it |

None verified a signature or a checksum. All three pointed at branch tip, so
whatever was pushed twelve minutes ago ran against real funds. `grep -rniE
"sha256|shasum|Get-FileHash"` across all nine installer scripts returned nothing,
while BeamMW publishes a `checksums.txt` and a `.asc` beside every asset — and
the scripts already downloaded the per-binary checksum file and ignored it.

### What is there now

- The bundle-rewriting updater is **removed**. It was also structurally
  incompatible with code signing (see §3).
- The installers **report** that an update exists and print the command; they no
  longer reset the user's checkout out from under them.
- `POST /api/update` is restricted to git checkouts, requires
  `BEAM_ALLOW_GIT_UPDATE=1`, and requires `confirm: true` in the body — it
  returns `428 Precondition Required` otherwise. It is behind the origin +
  session-token guard, so a web page cannot reach it at all.

---

## 2. Signed updates, for free

**Tauri's updater does not need a code-signing certificate.** It uses its own
Ed25519 keypair, generated locally at no cost:

```bash
npm run tauri signer generate -- -w ~/.tauri/beam-lightwallet.key
```

The public key is compiled into the app; the private key signs each release and
lives only in a GitHub Actions secret. The client refuses any artifact whose
signature does not verify, so a compromised release host is not sufficient to
push code — an attacker would also need the signing key.

This is the whole secure-update story and it costs nothing. Keep it manual:
configure the updater to **notify**, not to install silently, so rule 1 holds.

Key handling:
- Private key never leaves the signing machine and CI secret store.
- Rotate by shipping a build carrying both old and new public keys, then drop
  the old one a release later.
- Losing the key means users must reinstall by hand — back it up offline.

---

## 3. Native packaging

### Why the current build cannot be signed

`Info.plist` sets `CFBundleExecutable` to a **bash script** that opens
Terminal.app, depends on the system `python3` (on a clean Mac `/usr/bin/python3`
is a 116 KB stub that triggers a multi-GB Xcode CLT install), and finishes with
`open http://127.0.0.1:9080` — so the UI is a browser tab with a bookmarks bar.

More fundamentally, the launcher used to `ln -sf` four directories into
`Contents/Resources` and overwrite files inside the bundle. A Developer ID
signature seals `Contents/` with a code-directory hash; the first write breaks
the seal and macOS refuses to launch with *"the application is damaged"* —
strictly worse than being unsigned. **Both are removed**: `serve.py` now takes
its data root from `BEAM_DATA_DIR` (defaulting to `~/.beam-light-wallet`), so
nothing needs to be written into the bundle.

### The target shape

1. `pyinstaller --onefile serve.py` → a ~15 MB self-contained binary. **No
   Python dependency ever again**, which removes the single worst first-run
   failure on macOS.
2. A Tauri shell whose window loads `http://127.0.0.1:<port>`, with that binary
   and the three BEAM binaries declared as `externalBin` sidecars.
3. `tauri build` emits `.dmg`, `.msi`/`.exe`, `.deb` and `.AppImage` from one
   config.

A real window, native menus, a ~10 MB shell (Electron is ~150 MB and puts a
Chromium attack surface next to seed phrases), and the signed updater above —
with the frontend and backend essentially untouched. Bundling the BEAM binaries
adds ~72 MB uncompressed (~30 MB compressed), which also means *you* control
which BEAM version users get. That is the entire lesson of HF6.

---

## 4. Distribution per platform, without paying

### Linux — fully solved, free

`.AppImage` needs no signing at all and runs on any distro. `.deb` can be signed
with `dpkg-sig` using a GPG key you generate yourself. Both come out of
`tauri build`. This is the best-supported platform of the three.

### Windows — free, via hash-verified manifests

An Authenticode certificate costs money, so skip it:

- **Scoop** — a manifest in your own bucket (just a GitHub repo) carrying the
  release URL and its SHA-256. Scoop verifies the hash before installing.
  `scoop install beam-lightwallet`.
- **winget** — accepts a manifest with a SHA-256; users get
  `winget install ...`. Package identity is verified even though the binary is
  unsigned.
- **SignPath Foundation** offers free Authenticode signing to open-source
  projects. Worth applying for; do not block on it.

Unsigned `.exe` still shows a SmartScreen warning on direct download. Package
managers are the way around that without paying.

### macOS — free, via Homebrew Cask

There is **no free notarization**. Apple charges $99/yr for the Developer
Program and there is no way around it. Without it, a downloaded `.app` is
quarantined and Gatekeeper blocks it, and the old "right-click → Open" trick was
removed in macOS 15 (the DMG still ships that instruction; it already fails on
the maintainer's own machine, which runs 15.6.1).

The free path that does not feel broken:

```bash
brew tap vsnation/beam
brew install --cask beam-light-wallet
```

A cask is a small Ruby file in a GitHub repo. It carries the download URL and a
**SHA-256 that Homebrew verifies**, so users get integrity checking without a
certificate. For unsigned casks Homebrew documents `--no-quarantine`; state that
plainly in the README rather than hiding it. `brew upgrade` then becomes a
perfectly good update channel that the user runs deliberately — which satisfies
rule 1 by construction.

Also worth doing regardless, both free:
- **Ad-hoc sign** (`codesign -s - --deep`) so the bundle is at least
  tamper-evident locally.
- Fix `Info.plist`: it claims `com.beamprivacy.lightwallet` and "Copyright 2026
  BEAM Privacy" while the repo is `vsnation/Beam-Light-Wallet`. You cannot
  notarise under another organisation's reverse-DNS, and it is wrong anyway.

---

## 5. What only money would buy

| | Cost | What it gets |
|---|---|---|
| Apple Developer Program | $99/yr | Notarised DMG that opens with a double-click, no `--no-quarantine` |
| Authenticode OV / EV | $200–600/yr | No SmartScreen warning on direct `.exe` download |

Neither is required for a secure, verifiable, self-updating app. They buy
first-run *friction removal*, not security — the Ed25519 update signature is
what actually protects users, and it is free.

---

## 6. Order of work

1. PyInstaller the server; kill the system-Python dependency.
2. Tauri shell + sidecars; one config emits all four installers.
3. Ed25519 update keypair; updater set to notify-only.
4. Homebrew cask, Scoop manifest, AppImage/.deb.
5. GitHub Actions: build, hash, sign the update manifest, publish on tag.
6. Then, if it is ever worth $99: notarise macOS.
