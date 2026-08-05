# BEAM Light Wallet — Productisation Plan

*Audit date 2026-08-04. Every claim below was verified against the working tree at `/Users/anastasiasmirnova/Desktop/Beam/LightWallet`; the HF6 evidence in §2 I reproduced live during this audit.*

---

## 1. Where the product actually stands

You have a working BEAM wallet with a genuinely broad feature set — send/receive, DEX, liquidity, minter, explorer, P2P escrow, three on-chain games — and almost none of the machinery that turns working software into a product. There is no build step, no CI (`.github/` does not exist), no dependency manifest, no lint config, one git tag, and the release process is `git pull origin main` executed inside a running wallet (`serve.py:1552-1558`). The frontend is two files totalling ~1 MB (`src/js/app.js` 615,270 bytes / 14,264 lines; `src/p2p/p2p.js` 382,881 bytes), alongside eleven tracked ES-module files that no HTML tag ever loads. All twelve C++ contract sources and 58 of 64 test files are gitignored (`.gitignore:140`, `:151`) while the compiled `.wasm` that users execute against real funds is tracked — the source that produced those bytes exists on one laptop. The version number disagrees with itself four ways right now (`app.js:8` = 1.0.5, `serve.py:1288` = 1.0.2, `config.js:86` = 1.0.0, `beam-wallet-inno.iss:5` = 1.0.0), and the BEAM binary version is hardcoded in thirteen separate files.

And the whole thing currently does not work on mainnet on macOS. That is the headline.

---

## 2. Ship-blockers

Nothing else in this document matters until these are resolved. Do not let a new user install this build.

### 2.1 HF6: macOS is out of consensus, and the wallet says everything is fine

I started the bundled macOS `wallet-api` 7.5.13882 against the **public** node `eu-node01.mainnet.beam.mw:8100` and called `wallet_status`. It returned:

```
current_height:          3928665          (one block before HF6 at 3928666)
current_state_timestamp: 1782894462       = 2026-07-01T08:27:42 UTC — 34.4 days stale
is_in_sync:              false
available:               127406738141     (1274.07 BEAM, plus 11 other assets)
```

Real chain tip at the same moment, from `explorer.0xmx.net/api/status`: **3,978,005**. The wallet is 49,340 blocks behind and reports a confident balance anyway.

Now the second half. `wallet-api` tells you the truth in the payload — `is_in_sync: false` — and `grep -rn "is_in_sync" src/` returns **zero hits**. The frontend never reads it. Instead `updateSyncStatus` at `src/js/app.js:853` computes:

```js
const synced = status.current_state_hash && height > 0;
```

Both are truthy, so the header renders `Mainnet (3,928,665)` in normal colour with a cyan pulsing dot (`src/css/styles.css:249-258`, where the dot colour is hard-coded and bound to no state). `serve.py` compounds it: `get_node_sync_status()` at `serve.py:463` declares `if current_height > 3000000: synced = True; progress = 100`, so a node permanently wedged at the fork boundary reports 100%. `src/js/app.js:4370-4385` then *acts* on that flag and silently migrates `wallet-api` onto the dead-fork local node.

**What a macOS user can do today:** unlock, see their addresses, see a balance and transaction history frozen at 2026-07-01.

**What they cannot do:** see any transaction received in the last 34 days; see a correct balance; broadcast a send (it is signed against a 34-day-stale tip under pre-fork rules and will not confirm); read current DEX/Fuddle/MemeClash contract state. And they cannot *tell* — the UI reports healthy mainnet sync throughout.

**Why it cannot be fixed by pointing at a newer binary:** I queried the BeamMW releases API. `beam-7.5.14493` (the HF6 hotfix, 2026-07-01) ships `linux-*` and `win-*` assets only. There is no `mac-*` asset. The last macOS build BeamMW ever published is 7.5.13882, dated 2024-05-25. Five weeks after an emergency fork, upstream has not shipped macOS and shows no sign of doing so.

**Fix, in order:**

1. **Today (S).** Make the wallet honest. Read `is_in_sync` and `current_state_timestamp` from `wallet_status` in `updateSyncStatus` (`app.js:849-864`); poll the explorer `/status` height you already fetch for the Explorer page (`src/index.html:951`). If `is_in_sync === false`, or local tip is >60 blocks behind the explorer, or the state timestamp is older than 30 minutes: red badge, no pulse, `Out of sync — 49,340 blocks behind`, and **disable Send and Swap**. Delete the `current_height > 3000000` heuristic at `serve.py:463`. This does not fix the wallet; it stops the wallet lying, which is the part that loses people's money.
2. **This week (M).** Build `wallet-api`, `beam-wallet` and `beam-node` from the `beam-7.5.14493` tag for macOS arm64, publish them as assets on *your* release, and point the macOS installer at them. This is the only real fix and it is unavoidable. It is also strategically the right move: you need to re-sign these binaries with your own Developer ID for notarisation anyway (§3.2), so building them yourself costs marginally more than re-signing someone else's and permanently unblocks you from upstream. Ship arm64 first; x86_64 only if someone asks.
3. **Same commit (S).** Kill the local-node default. `src/js/app.js:4517-4533` starts `beam-node` on **every unlock**; `:4806` and `:4936` do it on create and restore. That is a 9.2 GB download (measured: `~/.beam-light-wallet/node_data` is 9.2 GB on this machine) for a capability nobody needs — `serve.py:1626-1660` injects the shader bytes from disk into every `invoke_contract`, so the client supplies the shader and the node only serves state. Public nodes are fine. Delete those three call sites and the auto-switch at `:4370-4385`; make the local node an explicit Settings action with a disk-size warning. Then fix the four UI strings that assert otherwise: `src/index.html:1473`, `:1542`, `:1588`, and `src/js/app.js:6796-6799`.

### 2.2 Any website can spend the user's funds

`serve.py:1074` sends `Access-Control-Allow-Origin: *` on every response, including the `/api/wallet` JSON-RPC proxy (`serve.py:1620-1690`), which forwards `tx_send` verbatim. There is no Origin check, no `Sec-Fetch-Site` check, no CSRF token anywhere in the file. A `POST` with `Content-Type: text/plain` is a CORS-simple request and needs no preflight at all. While the wallet is unlocked, any tab the user has open can drain it — and because `Allow-Origin: *` covers responses too, it can also read `addr_list` and `tx_list`, which for a privacy coin is worse.

**Fix (S).** Delete `send_cors_headers()` entirely — the frontend is served same-origin by this same server and needs no CORS. Add a guard at the top of `do_GET`/`do_POST`/`do_DELETE` rejecting anything whose `Origin` is present and not `http://127.0.0.1:{PORT}`, and whose `Host` is not `127.0.0.1:{PORT}`/`localhost:{PORT}` (this also closes DNS rebinding). Mint a random token at startup, inject it into `index.html` in `serve_with_route()` next to the existing `window.APP_ROUTE`, and require it on every `/api/*` mutation.

### 2.3 `DELETE /api/wallet/..` destroys every wallet on the machine

`serve.py:1241-1243`:

```python
wallet_name = self.path.split("/")[-1]
result = delete_wallet(wallet_name)
```

No validation — unlike `handle_create` (`:1469`) and `handle_restore` (`:1497`), which both enforce `^[a-zA-Z0-9_-]+$`. `delete_wallet` (`serve.py:966-981`) then `shutil.rmtree(WALLETS_DIR / wallet_name)`. `WALLETS_DIR / '..'` resolves to `~/.beam-light-wallet` — every wallet.db, the binaries, node_data, logs. Reachable cross-origin because of 2.2.

**Fix (S).** Same regex as create/restore, URL-decode before validating, plus a containment assert in `delete_wallet`: `if (WALLETS_DIR / name).resolve().parent != WALLETS_DIR.resolve(): return error`.

### 2.4 Secrets on the command line

`serve.py:751-760` passes `--pass={password}` on argv; `:869-875` passes the 12-word **seed phrase** as `--seed_phrase=`; `:555-559` passes the owner viewer key *and* the password to `beam-node`; `serve.py:566` then `print`s that whole command line, password included, to stdout — which the launchers redirect into a log file that `os.chdir(BASE_DIR)` makes web-readable.

The bundled binaries already support the safer channel: a `wallet-api.cfg` in the working directory is read on startup, and `serve.py:768` already sets `cwd=str(BASE_DIR)`.

**Fix (S).** Write a mode-0600 `.cfg` into a private temp dir with `pass=`, `wallet_path=`, `node_addr=`, `owner_key=`; run the child with `cwd=` that dir; unlink once the process is up. Redact the `print` at `serve.py:566`.

### 2.5 XSS from a received transaction

`src/js/app.js:6294` renders `tx.comment` raw into `innerHTML`. Asset metadata is equally raw — `getAssetInfo` (`app.js:6996-7005`) reads `meta.N`, `meta.UN`, `meta.OPT_ICON_URL` off-chain and `renderAssetCards` interpolates them at `app.js:1160` into both an attribute *and* an inline `onerror=` JS string. No escaping helper exists anywhere (`grep -E 'escapeHtml|sanitiz|DOMPurify' src/js/` → zero hits across 240 `innerHTML` uses), and there is no CSP.

Attacker sends you 1 groth with a payload in the memo, or mints a CA whose name is the payload and dusts you. Script runs in the wallet's origin, reads `sessionStorage.getItem('walletPassword')` (stored plaintext at `app.js:4486`), calls the same-origin proxy. Receiving is what a wallet is *for*; this needs no user mistake at all.

**Fix (S).** One `escapeHtml()` applied at source in `getAssetInfo` (`:6996-7005`) and `getAssetInfoBasic` (`:7064-7065`) so every downstream template is safe by construction, plus the three `tx.comment` sites (`:6294`, `:6395`, `:6436`). Allowlist `OPT_ICON_URL` to `https?:` before it reaches a `src=`. Bind the `onerror` handler with `addEventListener`, never string-interpolate into it.

### 2.6 Two installers download URLs that do not exist

`install.ps1:51` and `build/windows/BEAM-LightWallet-Setup.ps1:120` request `windows-wallet-api-$VERSION.zip`. The real assets are `win-*`. `windows_install.bat:164` and `build/windows/start.bat:164` use the correct prefix — the repo contains both spellings. Neither PowerShell path checks the HTTP status before `Expand-Archive`, so the user gets an unzip error, not a download error. `README.md:87-110` compounds it with `.tar.gz` names for a release that publishes `.zip` only.

**Fix (S).** Fold into the single manifest from §4.1 so the string exists once.

---

## 3. The productisation track

The order matters: each step is a prerequisite for the next. Do not start at signing.

### 3.1 First: stop mutating the app bundle (M, prerequisite for everything)

`build/macos/create-dmg.sh:110-114` runs four `ln -sf` calls into `Contents/Resources` on **every launch**, and `:136-151` curls `main.tar.gz` and overwrites `serve.py`, `src/`, `config/` and `shaders/` *inside the bundle*. I confirmed the live bundle has these symlinks; the shipped 1.0.5 DMG does not, so this is runtime mutation.

A Developer ID signature seals `Contents/` with a code directory hash. The first symlink breaks the seal and macOS refuses to launch with "the application is damaged" — strictly worse than today's unsigned state. **You cannot sign this design.** Make `serve.py` resolve its data root from an env var or platform default instead of expecting sibling directories, so the symlinks are unnecessary. Ship app code inside the signed bundle and never rewrite it in place.

Same commit: delete the unprompted `git reset --hard origin/main` at `macos_install.sh:133`, and delete `linux_install.sh` (byte-identical to `macos_install.sh`, same md5).

### 3.2 Then: native shell — Tauri with a Python sidecar (L, ~2-3 weeks)

You asked for "a standalone native macOS and any other OS app." Today `Info.plist:15` points `CFBundleExecutable` at a **bash script** that opens Terminal.app to run curl (`create-dmg.sh:187-226`), checks `command -v python3` (which passes on a clean Mac via the CLT shim, then triggers the Xcode installer dialog when actually invoked at `:239`), and ends with `open http://127.0.0.1:9080` — the UI is a browser tab with a bookmarks bar.

Do **not** rewrite `serve.py`'s 2,410 lines in Rust. The cheap path:

1. `pyinstaller --onefile serve.py` → a ~15 MB self-contained binary, no Python dependency ever again.
2. Tauri shell whose window loads `http://127.0.0.1:<port>`, with that binary and the three BEAM binaries declared as `externalBin` sidecars.
3. `tauri build` emits `.dmg` (signed + notarised), `.msi`/`.exe` (signed), `.deb` and `.AppImage` from one config.

You get a real window, native menus, a ~10 MB shell (vs Electron's ~150 MB), a code-signing story, and the built-in updater — with the frontend and backend essentially untouched. Bundling the BEAM binaries adds ~72 MB uncompressed (~30 MB DMG), which is entirely acceptable and is also what lets you control which BEAM version users get, which is the whole lesson of §2.1.

### 3.3 Then: signing and notarisation, per platform

**macOS.** Apple Developer Program, **$99/yr**, enrolment takes a few days. Developer ID Application + Developer ID Installer certs. Sign the app with `--options runtime --timestamp`; you must also re-sign the bundled BEAM binaries under your Team ID (add `com.apple.security.cs.disable-library-validation` only if that fails). `xcrun notarytool submit --wait`, then `xcrun stapler staple` both the `.app` and the `.dmg` so it validates offline. Also fix `Info.plist:9` — it claims `com.beamprivacy.lightwallet` and `:26` "Copyright 2026 BEAM Privacy" while the repo is `vsnation/Beam-Light-Wallet`. You cannot notarise under another org's reverse-DNS. Use something you own.

And delete METHOD 1 from `create-dmg.sh:295-315` — "Right-click the app, click Open" was removed in macOS 15 Sequoia, and `sw_vers` on your own machine reports 15.6.1. The instruction you ship already fails for you.

**Windows.** Azure Trusted Signing at ~$10/month is the best option if you qualify (verified org, or an individual identity 3+ years old); otherwise an OV cert at ~$200-400/yr, or EV at ~$300-600/yr for instant SmartScreen reputation. Add `SignTool` to `build/windows/beam-wallet-inno.iss`, which today **cannot compile**: `:46-47` reference `Start-Wallet.bat`/`Stop-Wallet.bat`, which do not exist in `build/windows/` — they are generated at runtime by a *different* installer (`BEAM-LightWallet-Setup.ps1:142`, `:152`) — and `:25` sets `SetupIconFile` to a macOS `.icns` at a path that is also wrong. Pick Inno, finish it, delete the PowerShell installer.

**Linux.** Free. Tauri emits `.deb` and `.AppImage`; sign the `.deb` with `dpkg-sig` and embed a signature in the AppImage. Keep curl-pipe-bash as a documented developer path only, not the headline.

### 3.4 Then: one signed auto-update channel

You currently have **three** unverified update channels, all pointed at branch HEAD:

- `create-dmg.sh:136-151` — curl `main.tar.gz`, overwrite bundle contents, gated on an osascript yes/no.
- `macos_install.sh:126-140` — `git fetch` + `git reset --hard origin/main` on every launch, **no prompt**.
- `serve.py:1540-1596` — `POST /api/update` → `git pull origin main` → `os.execl`, no CSRF token (so §2.2 makes it web-triggerable).

None verifies a signature or a checksum. `grep -rniE "sha256|shasum|Get-FileHash"` across all nine installer scripts returns zero — while BeamMW publishes `checksums.txt` and a `.asc` next to every asset, and you already **download** `wallet-api-checksum.txt` into `~/.beam-light-wallet/binaries/macos/` and then ignore it.

Worse, the channel is spliced onto the wrong artifact: `app.js:29-38` compares against the GitHub *release tag* and shows the user "New version v1.0.6 available", then `/api/update` hands them HEAD of `main`. And for DMG users the download link 404s — `app.js:116` and `:354` build `BEAM-LightWallet-${version}.dmg` while `create-dmg.sh:11-12` produces `Beam-Light-Wallet-1.0.5.dmg`. Different capitalisation, different hyphenation. That is the default macOS experience.

**Fix.** One channel: Tauri's updater (Ed25519-signed manifest, public key embedded in the app, refuses unverified artifacts, atomic replacement, cross-platform). Delete all three existing paths. Verify the BeamMW `.asc`/checksum after every binary download — the file is already on disk, it needs a `shasum -c`. Add a CI step asserting the built artifact filename equals the string the frontend constructs.

### 3.5 CI (M) — do this alongside 3.3, not after

`.github/workflows/ci.yml` on push/PR: `python -m compileall serve.py` + `ruff check`; `node --check src/js/**/*.js`; start `serve.py 9080` and run `tests/test_selenium.py --headless`. That last one already exists, is already tracked, already defaults to port 9080 (`:47`), already supports `--headless` (`:6-7`), contains 12 tests, and spends no funds — and nothing invokes it. It is the highest-leverage automation asset you own. On tag push: build, sign, notarise, attach, publish.

Also: `tests/run_tests.sh:28` invokes `tests/test_wallet_v2.py`, which does not exist. The documented one-click runner is a guaranteed failure. Point it at `test_selenium.py` and change ports 8080→9080 at `:12,14`.

---

## 4. The engineering track, by payoff per unit of effort

### 4.1 One manifest for versions (S) — do it first, it unblocks the HF6 ship

`7.5.13882` is hardcoded in 13 files across bash, batch, PowerShell, Inno Pascal, JS and Markdown: `install.ps1:12`, `start{,-macos,-linux,-windows}.sh:12/15`, `build/macos/create-dmg.sh:13` **and** `:81`, `build/windows/{start.bat,install-beam-wallet.bat}:21`, `build/windows/beam-wallet-inno.iss:9`, `build/windows/BEAM-LightWallet-Setup.ps1:22`, `build/linux/install-ubuntu.sh:24`, `src/js/config.js:87`. Shipping 7.5.14493 to Linux and Windows while macOS goes to your own build means editing all of them correctly, with no test that catches a miss.

Create `config/binaries.json`:

```json
{ "app_version": "1.1.0",
  "platforms": {
    "macos-arm64": { "beam_version": "7.5.14493", "url": "…/your-release/mac-arm64-wallet-api-7.5.14493.zip", "sha256": "…" },
    "linux-x64":   { "beam_version": "7.5.14493", "url": "…", "sha256": "…" },
    "windows-x64": { "beam_version": "7.5.14493", "url": "…", "sha256": "…" }
  },
  "min_consensus_height": 3928666 }
```

Every installer and `serve.py` reads it. Add `.installed_version` stamped into `~/.beam-light-wallet/binaries/<platform>/` and compare on startup — **binaries must be upgradeable independently of app code**, which is exactly the lever you did not have when HF6 landed. Same file carries `app_version`; delete `app.js:8`, `serve.py:1288`, `config.js:86`, and have the frontend read it from `/api/status`. CI greps for any stray `7\.5\.\d+` or `1\.0\.\d+` and fails the build.

### 4.2 Un-ignore contracts and tests (S)

`.gitignore:140` ignores `contracts/`, `:151` ignores `tests/`. Result: 0 of 12 C++ contract sources and 6 of 64 test files are in git, while the compiled `.wasm` those sources produced **is** tracked (`shaders/fuddle_*.wasm`, `p2p_escrow_*.wasm`, `airdrop_*.wasm`) and holds real user funds. Nobody — including you, after a disk failure — can rebuild or audit them.

The likely reason for the blanket ignore is hardcoded mainnet passwords in the test files (`tests/test_frontend_comprehensive.py:20`, `tests/unlock_wallet.py:11`). Replace those with `os.environ.get(...)` and commit everything. Add a `make shaders` target and record the exact clang version. Also stage `src/js/pages/meme_battle.js` and `src/css/meme_battle.css` — they are untracked, `src/index.html` is modified and now references them at lines 20 and 2591, and the next `git commit -am` ships an index.html that 404s two assets on every fresh clone.

### 4.3 Delete the decoy module tree (S)

`src/index.html` loads exactly six classic scripts (lines 25, 27, 29, 2590, 2591, 2592). Meanwhile eleven tracked files use ESM syntax and import each other and are loaded by nothing: `config.js`, `api.js`, `state.js`, `utils.js`, `components/{modals,navigation,toasts}.js`, `pages/{dex,send,receive,transactions}.js`. `config.js:47` even carries the comment "Must match AIRDROP_CONTRACT_ID in serve.py" — a hand-sync contract on a file no runtime reads. Anyone told "config lives in config.js" makes a change with zero effect that passes review.

Delete all eleven. Extract one real `src/js/constants.js` (BEAM_LOGO, ASSET_ICONS, ASSET_CONFIG, GROTH, DEFAULT_FEE, DEX_CID, AIRDROP_CID) loaded as a classic script before `app.js`, remove those blocks from `app.js:439-581`/`:6478`/`:12918`, and have `p2p.html` load the same file so the iframe stops carrying its own copy. Also delete `src/css/styles1.css` (39 KB, referenced nowhere) and `src/templates/body.html` (61 KB, same).

### 4.4 Fix the polling leaks (S) — this is the real "optimization layer"

`showPage()` (`app.js:920-922`) stops exactly two intervals: `dexActivity` and `explorerRefresh`. Everything else survives navigation — fuddle countdown (30 s), fuddle tx poll (10 s), MemeClash refresh (30 s → 6 API calls per tick), MemeClash tx poll (10 s), airdrop tx poll (10 s). `cleanupMemeClash()` exists at `src/js/pages/meme_battle.js:1726` and grep finds only its own definition; it is never called. Worse, `:1721` assigns `mcState.refreshInterval = setInterval(...)` with no preceding clear, so **each MemeClash visit orphans an uncancellable interval**. Five visits = ~98 API calls/minute on an idle dashboard, growing without bound. There is no `visibilitychange` handler anywhere in `src/`.

Register every timer through the existing `activeIntervals` registry (`app.js:584-594`), call `stopAllIntervals()` at the top of `showPage()`, and gate every poller on `document.hidden`. The correct pattern is already in your codebase at `app.js:12776-12783`.

While you're there: `src/index.html:663` is a plain `<iframe src="/p2p/p2p.html">` with no lazy load and no JS ever setting its src — so **every launch** eagerly fetches 635 KB of P2P code plus a CDN Gun.js, for an alpha feature most sessions never open. Set the src on first navigation instead.

### 4.5 Threading and shutdown in serve.py (M)

`ReusableHTTPServer(HTTPServer)` (`serve.py:2395`) is single-threaded and its handlers block: `switch_to_local_node` (`:632-697`) chains a 30 s subprocess, three `time.sleep(3)`s and a 15-attempt poll loop — 40-60 seconds holding the only thread, during which the entire UI, including CSS and JS, is frozen. Switch to `ThreadingHTTPServer` with a `threading.Lock` around the module globals, and move unlock/node-switch/rescan behind a job model (`POST` returns `{job_id}`, `GET /api/job/{id}` returns progress).

Shutdown: `main()` catches only `KeyboardInterrupt` (`:2400`); there is no `signal.signal` and no `atexit` in the file, while `start-macos.sh:249` kills with SIGTERM. So closing the app routinely leaves `wallet-api` running with the wallet **decrypted** on 127.0.0.1:10000 with no auth. Register SIGTERM/SIGINT and atexit handlers.

Process identity is guessed by substring: `pgrep -f wallet-api`. During this audit that pattern matched my own `tail -f wallet-api.log` — verified live in the process listing. `get_wallet_api_pid()` can return a stranger's PID and `stop_wallet_api()` will SIGKILL it. Track children through `Popen` objects and validated PID files; delete `kill_by_name` entirely.

### 4.6 Fix the two silently-shadowed functions (S)

`copyToClipboard` is defined at `app.js:6467` — `(text)`, shows a "Copied!" toast, catches failures — and again at `app.js:11354` — `(text, btn)`, no toast, no `.catch`. The second wins. All ten single-argument callers (tx kernel, txId, sender, receiver at `:6277`-`:6300`; wallet addresses at `:6392`-`:6439`) now copy with **zero feedback** and swallow failures. That is a live shipping UX defect, invisible in review because the definitions are 4,900 lines apart. Same story for `openSendModal` (`:2318` stub vs `:5150` real).

### 4.7 Split app.js along its own seams (M, after 4.3)

The module boundaries are already written into the file as banner comments: Quick Trade (1351), UTXO Split (1785), App Store (4957), DEX (6476), Liquidity (7115 **and** 8492 — both labelled "LIQUIDITY FUNCTIONS"), Local Node (9204), Donations (9544/9934), Minter (10125), Explorer (10697), Airdrop (12915). Split into ~12 classic scripts, each ending with `Object.assign(window, {...})` so the 317 inline `onclick=` handlers keep working. Two to three days, no HTML rewrite, immediate file-level ownership and a readable diff. The precedent is your own P2P iframe at `index.html:663` — 10,077 lines fully isolated behind an 8-action postMessage bridge.

---

## 5. Design direction

**Fix the icon before anything else visual.** `build/macos/AppIcon.svg` packs seven competing elements into one 512 px square: a grid pattern (`:41-48`), a BEAM prism (`:51-62`), a wallet with three card slots (`:65-77`), a `$F` badge (`:80-85`), a shield (`:88-93`), the words "LIGHT WALLET" at 28 px in **Arial** (`:96-98`), and four corner brackets (`:101-104`). At Dock size the 28 px text is 1.7 px tall and the whole thing is teal mud. It is the most-seen asset you have.

Pick **one** mark. Three currently claim to be the brand: a circle-with-checkmark in the sidebar (`index.html:42-51`), a cyan triangular prism on the unlock screen (`app.js:4020-4035`), and the wallet/shield/badge composite in the icon — plus a fourth, a hand-drawn un-anti-aliased bullseye in `create-icon.sh:26-101` that ships silently if `AppIcon.icns` is ever absent. Take the prism. It is the best of the three and it survives reduction. Build three explicit tiers rather than one artwork scaled: 1024/512 with a gradient ground, 128/256 flat, 32/16 silhouette only. Never put words in an app icon. Use Apple's grid — artwork at ~824/1024 with transparent margin and a 185/1024 corner radius; the current `rx="96"` on a full-bleed square will look visibly wrong next to native apps. Delete `create-icon.sh`.

**Branch the first screen on wallet count.** Today a first-time user sees an Account `<select>` reading "No wallets found" (`app.js:4263-4266`) above a full-width gradient CTA reading **UNLOCK WALLET** (`:4057-4063`), with "Create New" and "Restore" demoted to 12 px `#94a3b8` ghost links below a divider. The biggest thing on screen is the one action they cannot take. Zero wallets → show a welcome panel, "Create a new wallet" as primary, "I already have a seed phrase" as secondary, no select, no password field.

**Verify the seed.** `app.js:4113-4116` is a bare checkbox. Blank three random positions and require the user to type them. Ledger, Exodus and MetaMask all do this; a wallet that doesn't reads as a prototype, and it is a real fund-loss vector.

**Raise the type floor and fix the contrast.** Across `src/css/*.css` there are 254 declarations at ≤12 px (95× 12, 92× 11, 49× 10, 12× 9, 6× 8) against 74 at 14 px — body text is 11-12 px, where macOS system body is 13. `variables.css` has colour, radius, shadow and z-index tokens but zero type or spacing tokens, so every size is a magic number, and `src/index.html` carries 473 inline `style=` attributes. Meanwhile `--text-muted: #64748b` on `--void: #050a0f` measures **4.18:1** — below the 4.5:1 AA threshold — and appears ~300 times, overwhelmingly on 10-12 px text. Small *and* low-contrast is the exact combination that reads as cheap. Add `--text-xs: 12px` … `--text-display: 32px` and `--space-1` … `--space-8`, sweep every 8-11 px to 12 px minimum, move body to 14-15 px, and lighten `--text-muted` to `#8b98ab` (≈5.9:1).

**Make the network badge a real three-state control.** Covered in §2.1 — but note the design consequence: bind the `::before` dot colour to a state class instead of hard-coding `var(--beam-cyan)` at `styles.css:253`, and drop the `pulse` animation in the red state. A pulsing red dot reads as "working on it," which is the wrong message.

**Errors must survive long enough to act on.** `showToast` (`app.js:2631-2638`) removes after 3,000 ms with no dismiss button, no hover-pause and no exit animation, and at least fifteen call sites pipe a raw exception straight into it (`app.js:1517`, `:1646`, `:2130`, `:2295`, `:2845`, `:2904`, `:2936`, `:3046`, `:3134`, `:3464`, `:4818`, `:4949`). `-32603 Internal JSON-RPC error` shown for three seconds is not an error message. Build one `errorToMessage(e)` returning `{title, message, hint, action}` — the good version already exists at `app.js:2429-2445`, it just isn't the pattern — make errors persist until dismissed, and give `.empty-state` (`styles.css:2457`) an action slot so "No transactions yet" offers `[Receive BEAM]`.

**Basic keyboard and a11y floor.** `grep -o "aria-[a-z]*"` across `index.html`, `app.js` and the CSS returns **zero** matches. All 12 nav destinations are `<div>`s with click handlers and no `tabindex` (`index.html:55-137`), labelled only by `data-tooltip` rendered on `:hover`. `openModal`/`closeModal` (`app.js:2305-2311`) toggle a class — no Escape, no backdrop click, no focus trap. The only global keydown in the entire application is Ctrl+` to open the **Debug Console** (`app.js:9400-9405`). That is the whole keyboard story of a desktop wallet. Convert nav to `<button aria-label>`, add Escape + backdrop + focus restore to modals, add Cmd/Ctrl+K / S / R / Cmd+L, and add a `prefers-reduced-motion` block to `base.css`.

**Finally: add a headline balance.** The dashboard (`index.html:203-330`) goes quick-actions → asset carousel → balances table with no aggregate figure anywhere — `grep` for `total-balance|portfolio` finds only per-asset locals. "How much do I have?" is the first question a wallet answers. The per-asset USD values already exist via `getAssetUsdValue` (`app.js:1145`); this is a sum and a render. And either wire the notification bell (`index.html:170-174` — styled like the working buttons beside it, has no onclick, does nothing, permanently) or delete it.

---

## 6. Roadmap

### Phase 1 — Stop the bleeding (this week)

**Goal:** the shipped wallet never lies about its own state, and cannot be attacked from a browser tab.

- Honest sync state: read `is_in_sync`, compare to explorer height, red badge, disable Send/Swap (`app.js:849-864`; delete `serve.py:463` heuristic)
- Kill CORS wildcard + add Origin/Host check + CSRF token (`serve.py:1073-1076`, `1199-1247`)
- Validate the DELETE wallet path (`serve.py:1241`, `966-981`)
- `escapeHtml` at source in `getAssetInfo`/`getAssetInfoBasic` + the three `tx.comment` sites
- Secrets into a 0600 `.cfg`, redact `serve.py:566`
- Remove local-node autostart from unlock/create/restore; fix the four "DEX requires a local node" strings
- Fix `copyToClipboard`/`openSendModal` shadowing
- `git add src/js/pages/meme_battle.js src/css/meme_battle.css`

**Done when:** a cross-origin `POST /api/wallet` is rejected; `DELETE /api/wallet/..` returns 400; a tx with `<img onerror>` in the memo renders as text; the badge reads `Out of sync — 49,340 blocks behind` in red with Send disabled; unlock does not start `beam-node`.

### Phase 2 — Back on mainnet (weeks 2-3)

**Goal:** macOS, Windows and Linux all follow the real chain, from one manifest.

- Build BEAM 7.5.14493 for macOS arm64; publish as release assets with SHA-256
- `config/binaries.json`; delete all 13 hardcoded `BEAM_VERSION` literals; `.installed_version` stamp + upgrade-on-mismatch
- Single app version read from that file; delete `app.js:8`, `serve.py:1288`, `config.js:86`
- Verify checksums after every binary download (all installers)
- Fix `win-` vs `windows-` in `install.ps1:51` and `BEAM-LightWallet-Setup.ps1:120`; fix `README.md:87-110`
- Un-ignore `contracts/` and `tests/`; env-var the test passwords
- `.github/workflows/ci.yml` with `test_selenium.py --headless`

**Done when:** a fresh install on all three platforms reports the true chain tip (±5 blocks) and a send confirms; bumping `beam_version` in one file upgrades an existing install on next launch; CI is green on `main`.

### Phase 3 — Native and signed (weeks 4-7)

**Goal:** it installs and updates like a real desktop app on all three platforms.

- Stop mutating the bundle (`create-dmg.sh:110-114`, `:136-151`); data root from env/platform default
- PyInstaller `serve.py`; Tauri shell + sidecars; bundle the BEAM binaries
- Apple Developer Program; Developer ID sign + notarise + staple; fix `Info.plist:9,26`
- Windows cert; finish `beam-wallet-inno.iss` (add the two missing `.bat` files, real `.ico`, SignTool); delete the PowerShell installer
- `.deb` + AppImage from Tauri
- One Ed25519-signed update channel; delete the three existing ones; fix the DMG filename mismatch (`app.js:116`, `:354`)
- ThreadingHTTPServer + job model + SIGTERM/atexit shutdown

**Done when:** `spctl -a -vvv -t exec` says *accepted*; `stapler validate` passes offline; SmartScreen does not warn; v1.1.0 → v1.1.1 updates itself with a verified signature and no Terminal window ever appears.

### Phase 4 — Feels like a product (weeks 8-11)

**Goal:** a stranger opens it and it reads as software someone owns.

- One icon, three tiers; one logo everywhere; delete `create-icon.sh`
- First-run branch on wallet count; seed re-entry verification; kill the modal guide
- Type + space scale; contrast fix; kill the 473 inline styles starting with the DEX panel (`index.html:426-510`)
- Skeleton loaders; persistent errors; `errorToMessage`; empty-state actions
- a11y floor + real keyboard shortcuts
- Headline balance; wire or delete the bell
- Interval registry + `document.hidden` gating; lazy P2P iframe; drop the three shader `<script>` tags and the `params.contract` assignments (`fuddle.js:135,228`; `app.js:667-677`) since `serve.py:1626-1660` already injects them; gzip + `Cache-Control` in `serve.py`
- Split `app.js` at its banner comments; consolidate the four launchers into one with `uname -s` detection; delete `linux_install.sh`

**Done when:** the Dock icon is legible at 32 px; a new user reaches a funded address without reading docs; the idle dashboard makes ≤6 API calls/minute after visiting every page; first paint transfers under 400 KB.

---

## 7. The five decisions only you can make

**1. Do you build BEAM binaries for macOS yourself?**
**Recommendation: yes, and treat it as a permanent responsibility.** Upstream has shipped no macOS build since 2024-05-25 and none five weeks after an emergency fork. Waiting is not a plan; it is how your entire macOS user base ended up 34 days out of consensus without knowing. You must re-sign these binaries under your Team ID for notarisation regardless, so building from the `beam-7.5.14493` tag costs marginally more than re-signing someone else's and permanently removes upstream from your critical path. It also makes you the only working BEAM wallet on macOS, which is worth saying out loud.

**2. Tauri, or stay with Python-plus-browser?**
**Recommendation: Tauri, with `serve.py` as a PyInstaller'd sidecar — do not rewrite it in Rust.** The rewrite is the only genuinely L-sized item in this document and it buys you nothing a sidecar doesn't. Tauri gives you a real window, native menus, a ~10 MB shell, signed installers for all three platforms from one config, and a signed updater. Electron triples the bundle and adds a Chromium attack surface you do not want near seed phrases. Staying with a bash script that opens Terminal.app and depends on system `python3` is defensible only as an interim, and only if you at minimum embed a Python runtime and bundle the binaries.

**3. Does the local node stay?**
**Recommendation: keep it, but as an explicit opt-in that no default path ever triggers.** Contract calls do not need it — `serve.py:1626-1660` injects the shader from disk and public nodes serve state fine. The local node buys privacy and rescan, and that is worth offering to people who want it. It is not worth 9.2 GB and a multi-hour sync imposed on every user at unlock, and post-HF6 it is actively harmful because it steers people onto a private fork they cannot leave. Show the disk estimate up front, and never auto-switch.

**4. Does P2P ship in 1.1?**
**Recommendation: no — hide it behind a Settings flag and cut it from the default build.** It is 635 KB eagerly loaded on every launch for a feature documented as alpha, it depends on `gun-manhattan.herokuapp.com` (Heroku killed free dynos in November 2022, so it is very likely already dead and fails with only a `console.warn`), it does unsynchronized read-modify-write of JSON files under `BASE_DIR` — which is read-only in the very `.app` bundle you are about to ship — and it derives trust scores from a file any local process can edit. It is a second 10,077-line monolith to maintain while you are fixing consensus. Ship the wallet. Bring P2P back when it has an on-chain source of truth and a relay you control.

**5. Public repo with signed releases, or keep the current git-pull channel?**
**Recommendation: versioned signed releases, and delete every `git pull` path.** Today a user is shown "New version v1.0.6" and handed HEAD of `main` — mid-refactor commits, debug code, whatever was pushed twelve minutes ago — running against real funds, with no signature, no checksum, no rollback, and no test between your keyboard and their wallet. That is the single largest tail risk in the project. Tag, sign, publish, and make the update channel refuse anything it cannot verify. Keep the source public: for a privacy wallet that is a feature, and it costs you nothing once secrets are out of the test files and `contracts/` is committed.