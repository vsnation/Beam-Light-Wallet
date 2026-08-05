# Using the wallet from your phone

## Read this first

There is no such thing as 100% secure, and anyone who tells you otherwise is
selling something. What this guide gives you is the strongest practical setup:
**your wallet never listens on the internet, never listens on your Wi‑Fi, and
your phone reaches it through an encrypted tunnel that only you can open.**

That is a much stronger position than any "remote access" feature that opens a
port, and it is why the wallet is built this way rather than with a "share to
phone" button.

**The wallet stays on your computer.** Your phone is only a screen. Your keys,
your seed phrase and your `wallet.db` never leave the machine they were created
on. If you lose your phone, nothing is lost — there is nothing on it.

---

## What you must never do

These come up in every "how do I access my wallet remotely" thread. Each one
hands your money to strangers.

| Don't | Why |
|---|---|
| Forward port 9080 on your router | Puts an unlocked wallet on the public internet. It will be found — scanners sweep the whole IPv4 space in hours, not days. |
| Use ngrok / localtunnel / Cloudflare Quick Tunnel | Gives a public HTTPS URL to anyone who learns it, and the tunnel operator can see your traffic. |
| Change the wallet to listen on `0.0.0.0` | Everyone on your café, hotel or office Wi‑Fi can then read your balance and addresses, and spend your funds. |
| Put the wallet on a VPS "so it's always on" | Your seed phrase now lives on someone else's computer. |

The wallet deliberately refuses most of these even if you try: it binds to
`127.0.0.1` only, and it rejects any request whose `Host` header is not a
loopback name. That is a safety net, not a licence to experiment.

---

## Method 1 — Tailscale + SSH tunnel (recommended)

Best combination of safe and easy. Free for personal use, no subscription, no
ports opened anywhere. Tailscale builds a private encrypted network between just
your own devices; SSH then carries the wallet over it.

### On your computer, once

**1. Install Tailscale** — <https://tailscale.com/download> — and sign in.
Free plan covers up to 100 personal devices.

**2. Turn on Remote Login.**

- **macOS:** System Settings → General → Sharing → **Remote Login** on.
  Set *Allow access for* to **Only these users** and pick just your account.
- **Linux:** `sudo apt install openssh-server && sudo systemctl enable --now ssh`
- **Windows:** Settings → System → Optional features → Add → **OpenSSH Server**,
  then `Start-Service sshd` in an admin PowerShell.

**3. Require a key, not a password.** This is the step people skip, and it is
the one that matters. On your computer:

```bash
# macOS / Linux
sudo sed -i.bak 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i.bak 's/^#*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
```

Then restart SSH (macOS: toggle Remote Login off and on; Linux:
`sudo systemctl restart ssh`).

Do **not** do this until step 4 has succeeded, or you will lock yourself out.

**4. Find your computer's Tailscale name:** `tailscale status` — something like
`my-macbook.tailnet-1234.ts.net`.

### On your phone, once

**5. Install Tailscale** from the App Store or Play Store, sign in with the same
account. Your phone and computer can now see each other and nothing else can.

**6. Install a free SSH client with port forwarding:**

- **iOS:** [Termius](https://apps.apple.com/app/termius/id549039908) (free tier
  includes port forwarding) or [a-Shell](https://apps.apple.com/app/a-shell/id1473805438) (fully free)
- **Android:** [Termux](https://f-droid.org/packages/com.termux/) (free, F‑Droid)
  or [JuiceSSH](https://play.google.com/store/apps/details?id=com.sonelli.juicessh) (free tier includes port forwarding)

**7. Generate a key on the phone** and copy the **public** key to your computer:

```bash
# In Termux / a-Shell on the phone
ssh-keygen -t ed25519
ssh-copy-id you@my-macbook.tailnet-1234.ts.net
```

If `ssh-copy-id` is unavailable, print `~/.ssh/id_ed25519.pub` on the phone and
append that line to `~/.ssh/authorized_keys` on the computer.

### Every time you want the wallet

**8. Start the wallet on your computer** as usual.

**9. On the phone, open the tunnel:**

```bash
ssh -N -L 9080:127.0.0.1:9080 you@my-macbook.tailnet-1234.ts.net
```

In Termius/JuiceSSH, add a **Port Forwarding** rule instead of typing this:
type *Local*, local port `9080`, destination host `127.0.0.1`, destination port
`9080`.

**10. Open `http://localhost:9080` in your phone's browser.**

> ### The port number must be 9080 on both sides
>
> The wallet only accepts requests whose `Host` header is `localhost:9080`,
> `127.0.0.1:9080` or `[::1]:9080`. This is what blocks DNS‑rebinding attacks,
> where a hostname an attacker controls resolves to `127.0.0.1`.
>
> So `-L 9081:127.0.0.1:9080` **will not work** — your browser sends
> `Host: localhost:9081` and the wallet answers `Invalid Host header`. Use the
> same number on both sides. If 9080 is taken on your phone, start the wallet on
> a different port on the computer and match it at both ends.

---

## Method 2 — SSH tunnel on your own network

If both devices are on the same Wi‑Fi and you do not want Tailscale, do steps
2, 3, 6 and 7 above and use your computer's LAN address:

```bash
ssh -N -L 9080:127.0.0.1:9080 you@192.168.1.42
```

Only works at home, and it does mean SSH is reachable by anything else on that
network — which is why Method 1 is better. Never forward port 22 on your router
to make this work away from home; use Tailscale instead.

---

## Locking down further

- **Lock the wallet when you finish.** The lock button stops `wallet-api`, so
  even a tunnel that stays open reaches a wallet that cannot sign anything.
- **Use a dedicated wallet for the phone.** Keep day-to-day amounts there and
  the bulk in a wallet you only open on the computer.
- **Turn Remote Login off when you are not using it.** One toggle.
- **Check `tailscale status` occasionally** and remove devices you no longer own.

---

## Why not a native mobile app?

BEAM's own mobile wallet exists and is the right answer if you want keys on your
phone: <https://beam.mw/downloads>. It is a separate wallet with its own seed.

This guide is for reaching *this* wallet — the one holding your existing
`wallet.db`, your contracts and your assets — without copying the seed onto a
device that travels in your pocket, gets lost, and gets picked up by someone
else.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| `Invalid Host header` | Tunnel ports don't match. Both sides must be 9080. |
| Browser cannot connect | The tunnel is not running, or the wallet is not started on the computer. |
| `Connection refused` on ssh | Remote Login is off, or Tailscale is not connected on both devices. |
| `Permission denied (publickey)` | The phone's public key is not in `~/.ssh/authorized_keys` on the computer. |
| Page loads but says wallet locked | Expected — unlock it with your password, same as on the computer. |
