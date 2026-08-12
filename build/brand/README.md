# Brand assets

One mark: the prism. Everything here is that same shape sized for a different
hole, not a family of different logos.

| File | Size | Use |
|---|---|---|
| `x-avatar.svg/.png` | 400×400 | X / social profile picture. Carries its own dark disc. |
| `x-banner.svg/.png` | 1500×500 | X header. |
| `logo-lockup.svg/.png` | 470×160 | README header, docs masthead, og:image, slides. |
| `logo-mark.svg/.png` | 256×256 | The mark alone, transparent, when a container already exists. |

The app icon lives in `../macos/icon/` — it carries Apple's rounded square and
margin ratios and is not interchangeable with these.

PNGs are rendered at 2× (so `x-banner.png` is 3000×1000). Re-render after editing
any SVG; the PNGs are build output, not sources.

## Why the mark is what it is

A hollow triangle with one lit face. The hollow is the entire silhouette — fill
it in and this becomes an anonymous delta that reads as any of a hundred other
crypto logos.

**Never put words inside the mark.** The original app icon packed seven competing
elements plus a 28px Arial caption into one square; at Dock size the text was
1.7px tall and the whole thing read as teal mud. The lockup is where words go.

## What was tried and rejected

**A beam entering the apex of the avatar.** The reasoning was that the light is
what makes the mark mean "Beam". Rendered at the sizes X actually uses — 48, 64,
128 and 200px — it read as an antenna, and at 48px as a stray needle that looks
like a rendering artefact. The beam belongs on the banner, where there is room
for it to be a beam.

## The banner

The picture is the product's promise as one figure: a single traceable ray enters
the prism and leaves as separated colour you cannot follow back.

The optics are computed, not eyeballed. The ray ends at x=309.4 and the
refraction begins at x=438.6 — the actual intersections of the ray's height with
the triangle's left and right faces. The first draft had the ray stopping 59px
short of the glass and the fan starting 65px *inside* it, so the beam floated in
space and the light appeared to come from nowhere.

### Layout constraints

X crops this differently everywhere:

- On mobile the left and right edges are cut. Only the centre ~60% is safe.
- On desktop the profile picture covers the **bottom-left**, roughly a 200px disc
  centred near x=200, y=500.

So nothing that matters goes below y≈340 in the left 430px, and the message sits
between x≈430 and x≈1240. Check any change against `_banner-crops.png`, which
renders the banner as X displays it, avatar and all.

### The words

Per `~/.claude/USER_PSYCHOLOGY.md`:

- The headline states the reader's **pain**, not the technology. "Fully
  decentralised desktop wallet with local binaries" says nothing to a person;
  *"Your balance is nobody's business"* names something they already feel.
- **Loss framing** for the hook, gain framing for a CTA.
- The sub-line answers "how", once, in plain words.
- The proof strip is **checkable specifics**, because a crypto reader's default
  assumption is that this is a scam. "No accounts / No custody / Open source" can
  be verified; "secure and fast" cannot.
- No coins, no rockets, no stock 3D.

## Palette

| | |
|---|---|
| `#25c2a0` | BEAM green — the brand colour |
| `#6cf0d2` · `#5ce9c6` | lit face, highlight text |
| `#1f9b81` · `#0e5749` | shadowed face |
| `#00d4ff` | the cool edge of the refraction, sparingly |
| `#050a0f` · `#0a1420` · `#0b1a2a` | grounds |
| `#f4f9fc` · `#a3b7c8` | headline, body |

## Regenerating the PNGs

The SVGs use `Outfit`, falling back to Helvetica/Arial. Render through a browser
so the text lays out the way it will for everyone else:

```bash
python3 /tmp/render_all.py     # see the git history of this directory
```

Anything that rasterises SVG will do, as long as it renders at 2× and does not
substitute a different font silently.
