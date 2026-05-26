---
name: brett-design
description: Use this skill to generate well-branded interfaces and assets for Brett (Systemisches Brett), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI-kit components for prototyping both the Coaching (3D mannequin board) and Mayhem (3D combat) surfaces.
user-invocable: true
---

# Brett — Design Skill

Brett is a German-language, browser-based **3D systemic-constellation board** that runs in two voices on a shared dark substrate:

- **Coaching** — calm therapy tool · sage figures on slate · brass selection rings · Newsreader/Geist/Geist-Mono.
- **Mayhem** — 3D combat / wave-survival · same ink, same brass · adds blood, fire, slash-glow, weapon HUD.

Both modes share **brass on ink**. Both are no-light-mode. Both speak German with *du*, middle-dot-separated hints, and zero exclamation marks.

## How to use this skill

1. **Read `README.md` first** — it is the single source of truth for voice, foundations, iconography. Do not skip it.
2. **Read `colors_and_type.css`** — every CSS variable that names a brand color or type token lives here. Import it into any new HTML you create.
3. **Look at the cards in `preview/`** — small HTML specimens of every foundation (substrate, brass, sage, joints, type, spacing, radii, shadows, buttons, HUD bar, mode cards, figure-editor, scoreboard, faces, accessories, weapon icons, sprites, Unicode glyphs).
4. **For a working surface, copy a UI kit** — `ui_kits/coaching/` or `ui_kits/mayhem/` each contain a working `index.html` + JSX components. Re-use them; do not redraw the chrome from scratch.
5. **For assets, use what's in `assets/`** — the 5 weapon HUD icons (SVG + 128/256 PNG), 12 face textures, 22 accessory PNGs, 8 combat sprites. Do not generate new SVG icons unless they match the production style (`viewBox 0 0 64 64`, brass stroke 1.4px, round caps, corner cropmarks at opacity 0.35).

## Output guidance

- **Visual artifacts (slides, mocks, prototypes):** copy needed assets out of this folder into the new project, link `colors_and_type.css`, then assemble. Never inline duplicate token values — always reference vars.
- **Production code (the `brett/` repo):** the production tokens already exist in `brett/public/assets/figure-pack/colors_and_type.css` and `brett/public/assets/game_assets_mentolder/colors_and_type.css`. Read both before editing. The unified file here is the merge — use it as a reference, not as a drop-in (production has not yet merged).

## What to avoid

- Light mode of any kind. There isn't one.
- Bluish-purple gradients, emoji cards, cards with rounded corners + colored left-border accent only. None of these exist in production.
- Inventing new emoji. The only emoji in production are `🤸` (mayhem), `🌡 / 🎯` (stiffness slider labels). Everything else is Unicode (`＋ ▾ ✕ ✦ ● ↔ ↑ ⚙ ⚠`).
- New brass shades. There are exactly two: `--brass` (#c8a96e, coaching) and `--brass-game` (#d7b06a, mayhem). Pick one per surface.
- Drawing your own face/body/accessory illustrations. The figure-pack has 12 + 5 + 22 finished PNGs — use them. They are stylistically distinctive (parchment-warm, sage-deep, brass-tinted line) and impossible to match by sketching new SVG.

## Default-invoke behavior

If the user invokes this skill with no further guidance, ask:

1. **Which surface?** (Coaching / Mayhem / both / something else built on the substrate)
2. **What output?** (single screen / interactive prototype / slide deck / production-code patch)
3. **What's the user-facing copy?** (German is the default; if the answer is English, flag the tone mismatch with production)
4. **Are there specific figures or scenes involved?** (Coaching needs persona names, postures, accessories; Mayhem needs wave/weapon/scoreboard state)

Then act as an expert designer for Brett and output HTML artifacts (preferred) or production-style component code.

## Index of files

- `README.md` — voice, foundations, iconography. Read first.
- `colors_and_type.css` — every brand token. Import in every new HTML.
- `assets/icons/` — 5 weapon HUD icons (SVG + PNG 128/256).
- `assets/figure-pack/faces/` — 12 face textures.
- `assets/figure-pack/accessories/` — 22 accessory PNGs.
- `assets/sprites/` — combat sprites (blood × 4, fire-sprite, muzzle-flash, slash-arc, smoke-puff).
- `_source/` — original CSS + placement spec from the production codebase.
- `preview/` — small HTML cards that demo each foundation (drop the URL into a browser to see).
- `ui_kits/coaching/` — Coaching surface kit (interactive index.html + JSX).
- `ui_kits/mayhem/` — Mayhem surface kit (interactive index.html + JSX).
