# Brett Design System

**Systemisches Brett** — a German-language, browser-based **3D systemic-constellation board** that runs in two voices on the same substrate:

1. **Coaching** — the original therapeutic tool. Place wooden Bauhaus-style mannequins on a board, drag joints, sculpt postures, run constellations. Calm. Dignified. Sage + parchment + brass on slate.
2. **Mayhem** — a 3D combat / wave-survival mode that grew out of the same engine. Same mannequins, now sprinting, flailing, ragdolling into vehicles. Editorial restraint applied to game blood. Ink + brass + blood on the same dark substrate.

The genius of the system: **one visual language across both modes**. Brass is always the keystone. Heads are always Newsreader. Mono is always Geist Mono. A user who lays down a figure in Coaching and then enters Mayhem feels the room dim, not change.

> _"Brass-Stroke auf ink-Substrat, gedämpftes Tonrot als Game-Blut. Editorial — bis ans Schlachtfeld."_  
> — from the asset-pack catalog header

---

## Sources

This system was built from a single attached codebase (read-only):

- **`brett/`** — the production app. Node.js + Express + Three.js + WebSocket. Static HTML at `public/index.html`, all client code under `public/assets/`. Two parallel token files live there and have now been **unified** into the root `colors_and_type.css`:
  - `public/assets/figure-pack/colors_and_type.css` → coaching vocabulary
  - `public/assets/game_assets_mentolder/colors_and_type.css` → mayhem vocabulary
  - `public/assets/style.css` → in-app surface styles
  - `public/assets/figure-pack/placement_spec.json` → 14 bones, 12 faces, 5 body types, 22 accessories, all with anchor/offset/billboard rules for the Three.js rig
- Originals preserved verbatim under `_source/` for cross-reference.

Fonts (Newsreader, Geist, Geist Mono) are loaded from Google Fonts via CSS `@import` — no local font files needed and no substitution required; this is what the production app already does.

---

## CONTENT FUNDAMENTALS

Brett is German. All product copy, UI strings, button labels, and status messages are written in German.

### Voice

- **Quiet authority.** Status pills, modals, and tooltips state what just happened or what to do next. They never apologize. They never cheerlead. They never use "wir" — the app does not put itself in the conversation.
- **Imperatives without exclamation.** "Klick auf den Boden zum Platzieren" — not "Klicken Sie bitte auf den Boden, um eine Figur zu platzieren!". No marketing voice. No exclamation marks.
- **Du form.** When the app addresses the user it uses **du** ("Wähle deinen Modus", "Wähle deine Startausrüstung"). Never Sie — this is a tool you live inside, not one that bows to you. The Mayhem voice is the same form, just sharper.
- **Hint sentences are middle-dot-joined.** Pills and helper text use the `·` separator for compact instruction strings:
  - `Klick = Figur wählen · Doppelklick Boden = Figur teleportieren / neue Figur`
  - `12 sprites · 5 hud icons · 14 figure-pack · 1 readme`
- **No emoji in body copy.** UI text is plain. The two single exceptions live in mode-select hot-buttons where they read as iconography: `🤸 Mayhem` (acrobat), `⚙` (settings). The Mayhem button leans on a single, unprefaced emoji because it carries the whole genre.
- **Symbols stand in for words in compact controls.** `＋ Figur ▾`, `✕` (close), `✦ Aussehen` (appearance), `↔` (vehicle switch), `↑` (summoning direction), `⚠` (boss warning), `●` (online dot). Always Unicode, never emoji-flavored.

### Casing

- **Sentence case** for German prose (`Wähle deinen Modus`).
- **Title case** for English asset/section labels in the catalog (`Asset Pack · 01`, `Game assets, in Mentolder voice.`).
- **ALL CAPS** is reserved for eyebrows and labels — set in Geist Mono with `letter-spacing: 0.18em`. Never use caps on a sentence.

### Lexicon — recurring terms

| German                | English                | Where it appears                          |
|-----------------------|------------------------|--------------------------------------------|
| **Figur** / Figuren   | Figure / mannequin     | The thing on the board                     |
| **Brett**             | Board                  | The product itself, and the floor          |
| **Aufstellung**       | Constellation / setup  | The configured arrangement of figures      |
| **Aussehen**          | Appearance             | The drawer that edits face/body/accessories|
| **Welle**             | Wave                   | Co-op wave-survival rounds                 |
| **Steuerung**         | Controls               | Keybindings, gamepad, touch                |
| **Mayhem**            | Mayhem                 | Untranslated — the combat mode is named so |
| **Coaching**          | Coaching               | Untranslated — therapy-tool mode           |
| **Loadout**           | Loadout                | Untranslated in the loadout modal          |
| **Klick** / Doppelklick | Click / double-click | In hints; never "tap" even on touch        |

### Microcopy specimens (verbatim from production)

- Status pill: `Klick = Figur wählen · Doppelklick Boden = Figur teleportieren / neue Figur`
- Placing-mode pill: `Klick auf den Boden zum Platzieren — Esc zum Abbrechen`
- Mode-select heading: `Wähle deinen Modus` · cards: `Coaching · Systemische Aufstellung` / `🤸 Mayhem · 3D Kampfmodus · Waffen · Fahrzeuge`
- Loadout heading: `Wähle deine Startausrüstung` · columns: `Nahkampf` / `Fernkampf` · button: `Spielen`
- Co-op HUD: `WELLE 1 / 10`, `Feinde: 3`, `⚠ BOSS HP`
- Online indicator: `● 1 online`
- Eyebrow over the asset catalog: `ASSET PACK · 01`

### Tone summary

- **Calm in Coaching.** Body copy is Newsreader; numbers and labels are mono; verbs are infinitive ("Übernehmen", "Abbrechen", not "Speichern Sie jetzt!").
- **Cold-blooded in Mayhem.** Same fonts, same brass — just terser, more mono, more abbreviation. `24 / 90` for ammo, no "Schuss übrig".
- **Editorial throughout.** Even the asset catalog page is set like a magazine spread: `🤸` would feel wrong; `em-italic` brass-tinted phrases feel right ("_in Mentolder voice._").

---

## VISUAL FOUNDATIONS

### Substrate — always dark

There is **no light mode**, ever. The whole app — coaching and combat — lives on a near-black, slightly-warm dark navy. Two scales coexist because two design vocabularies were merged:

- **`--slate-0` `#0e1014`** — coaching app background
- **`--ink-900` `#0b111c`** — mayhem app background (very slightly warmer & deeper)
- Panels layer up: `--slate-1` `#161922`, `--slate-2` `#1f2330`, `--slate-3` `#2a3040` (hairline)
- Mayhem panels: `--ink-850` `#101826`, `--ink-800` `#17202e`

**Why two scales?** Because the original Coaching vocabulary leans olive-cool (parchment text reads warm against it) and the Mayhem vocabulary leans navy-cool (so brass HUD reads warmer). Stick to the matching scale per surface.

### Color

**Brass is the keystone.** Selection rings, active states, primary buttons, HUD highlights, eyebrows, em-italics — anywhere the user's eye is supposed to go. Two near-identical brass tokens exist:

- `--brass` `#c8a96e` — coaching brass (slightly softer, more parchment-leaning)
- `--brass-game` `#d7b06a` — mayhem brass (slightly warmer, more amber)
- `--brass-hi` `#f0d28c` — highlight / hover state in mayhem
- `--brass-soft` `#e0c690` — hover lift in coaching
- `--brass-mute` `rgba(215,176,106,0.35)` — outlines, mute brass border
- `--brass-tint` `rgba(215,176,106,0.06)` — fill behind active HUD slot

**Sage = figure body.** The mannequin's Lambert-shaded torso is `--sage` `#b8c0a8`. Secondary text on slate uses `--parchment-2` `#b9bda3`. The two are intentionally close — the figure feels made-of-the-room.

**Joint colors are semantic and inviolable.** These five colors map 1:1 to the joint balls on the mannequin and have meaning — designers MUST NOT redesign them. They appear on the figure, in the HUD, and in the editor:

- 🟡 **`--joint-wrist` `#e4c452`** — wrists
- 🟢 **`--joint-ankle` `#7fa37a`** — ankles
- 🔵 **`--joint-knee` `#6f8db8`** — knees
- 🟤 **`--joint-elbow` `#c8a96e`** — elbows (shares brass)
- 🌸 **`--joint-head` `#d29c8a`** — head pivot

**Mayhem extension.** Combat brings four extra tokens that should *never* appear in Coaching:
- `--blood-core` `#a83a30` (splat center) · `--blood-deep` `#5a1a14` (edge) · `--blood-bright` `#c4453a` (highlight) · `--fire-tip` `#fff5c8` (flame apex) · `--stille-blau` `#6fa8d8` (slash glow / info chips)

### Typography

Three families, never more:

- **Newsreader** (serif, weights 300–600 + italic) — all `h1`–`h3`, body-large prose, hero titles, modal headings. Set at modest weights (400 for h1, 350 for displays). Italic + brass tint is the only "look at this" treatment.
- **Geist** (sans, 300–700) — `h4` and below, UI affordances, body copy, buttons.
- **Geist Mono** (mono, 400–500) — eyebrows, labels, file names, ammo counters, keyboard hints, the entire game HUD voice. Always uppercase + `letter-spacing: 0.18em` when used as a label.

The serif/sans split is the system's rhythm: serif feels *contemplative* (Coaching), mono feels *operational* (Mayhem), sans bridges them. A heading set in mono would feel wrong in either mode.

### Imagery

- **No photography.** The brand is built from **flat, alpha-channel PNG illustrations** painted in the sage/parchment/brass palette: 12 face textures (`neutral`, `observing`, `mourning`, …), 22 accessories (hair, clothing, shoes), 5 body silhouettes.
- **No gradients in illustration.** Sprites are flat-shaded. The single exception: the radial brass `bg-halo` glow used behind hero sections (warm brass top-right, cool slate bottom-left, both blurred).
- **No stock illustration. No emoji-cards. No bluish-purple gradients.** Mayhem sprites (blood, fire, smoke) are intentionally muted — closer to ink-print than horror.
- **Decals & motion sprites.** Blood splats are 512×512 alpha PNGs in 4 rotated variants. Fire is a 4-frame horizontal sprite sheet (1024×256). Muzzle-flash, slash-arc, smoke-puff are 256×256.

### Spacing & layout

- **4px base unit.** `--s-1` (4px) through `--s-32` (128px). Use the scale; never write `padding: 14px`.
- **Topbar = 36px.** Fixed at top, full-width, `backdrop-filter: blur(6px)` over translucent slate. Items separated by 1px vertical hairlines.
- **Panels float.** Editor panels (figure-editor popover, appearance drawer) sit on top of the 3D canvas with 1px brass-mute border, no shadow on slate, 10–14px radius.
- **Drawer slides from the right** with a 200ms ease. 280px wide. On mobile (< 480px) it becomes full-width.
- **Modals** center on a 85%-opacity ink overlay. Cards inside are `--ink-800` with brass-mute border, 12px radius, 32px padding.
- **The 3D canvas is the layout.** UI floats over it: topbar, status pill (bottom-center), HUD (combat mode), drawer (right). Nothing scrolls. Nothing has a max-width container.

### Corners

- **Pills** (`--r-pill`, 999px) — status-pill bottom-center, "online" indicator, segmented controls.
- **Cards** (`--r-card`, 14px) — coaching panels, drawer content.
- **Tiles** (`--r-tile`, 8px) — HUD slots, mode-select tiles, weapon picks.
- **Chips** (`--r-chip`, 4px) — preset buttons, joint markers, key labels.
- **Inputs** (`--r-input`, 6px) — text inputs, color swatch wells.
- **Never use 0 radius.** Every surface is at least 4px-rounded.

### Borders

- Default panel border: `1px solid var(--line)` — that is `rgba(215,176,106,0.18)`, brass mute.
- Active/selected: `1px solid var(--brass)` plus `--shadow-ring-brass`. Never a 2px border.
- Hover on a button: border swaps to `var(--brass-mute)` from transparent. Background gains `rgba(231,234,208,0.08)` — a 4–8% parchment fill.
- Dividers between sections: `var(--hairline-soft)` — a 1px white-at-8%, parchment-cool.

### Shadows & elevation

- **`--shadow-1`** — `0 1px 0 rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.35)` — pressed buttons, sticking-up chips.
- **`--shadow-2`** — `0 8px 24px rgba(0,0,0,.45)` — floating panels, dropdowns.
- **`--shadow-modal`** — `0 30px 60px -30px rgba(0,0,0,.65), 0 12px 24px -12px rgba(0,0,0,.55)` — modals and the figure-editor popover.
- **`--shadow-ring-brass`** — `0 0 0 1px var(--brass), 0 0 24px rgba(200,169,110,0.25)` — selected figure ring, active HUD slot glow.
- **`--glow-brass`** — small soft brass halo for active states.

Shadows are always **darker than the substrate** (we live in dark mode) and **paired with a 1px line**. Never use shadow alone — depth comes from `line + shadow` together. No plasticky bevels, no inset highlights.

### Hover / press

- **Hover** lifts background by ~8% parchment alpha and switches border from transparent to `--brass-mute`. No transform.
- **Press / active** uses brass border + `--brass-tint` fill (6–14% brass). Primary buttons go to `--brass-soft`.
- **Selected figure** gets a flat brass ring on the floor (`RingGeometry(0.55, 0.62, 32)` in Three.js); other figures dim to `opacity: 0.55`.
- **Disabled** lowers opacity to 0.35–0.4, removes pointer.

### Animation

- **Subtle and quick.** `--dur-fast: 120ms` (icon swaps, hover), `--dur: 200ms` (drawer slide, panel toggle), `--dur-slow: 320ms` (modal in/out).
- **Easing:** `--ease: cubic-bezier(.2,.7,.2,1)` — pronounced ease-out, almost-no ease-in. Things appear quickly and settle.
- **No bounces.** No spring overshoot in UI. (The 3D body has Verlet springs — but that's physics, not motion design.)
- **Brass-shimmer / glow pulses** appear *only* on critical state changes (respawn overlay, low-HP warning). Never decorative.

### Transparency & blur

- **Topbar** is `rgba(14,16,20,0.85)` with `backdrop-filter: blur(6px)`. The 3D scene reads through.
- **Modal overlay** is `rgba(11,17,28,0.85)` — no blur in production (mode-select). Some overlays (respawn) add `backdrop-filter: blur(4px)`.
- **Tints used for "active"** are always brass at 6–14% over an already-dark surface. The substrate is doing the work.
- **Tooltips and floating help** sit on `rgba(14,16,20,0.85)`, never opaque.

### Layout rules

- **Topbar is fixed top, height 36px.** Never moved, never hidden.
- **Status pill is fixed center-bottom**, 24px from edge, transparent dark, brass hairline.
- **The 3D canvas absorbs the rest.** It sits at top: 36px, bottom: 0, full width.
- **No scrollbars.** `overflow: hidden` on `body`. Drawers and modals scroll internally.
- **No max-width container.** This is a fullscreen tool — there is no "article body" width.

### Surfaces & cards

A standard "card" looks like:
```css
background: var(--slate-1);       /* or var(--ink-850) in mayhem */
border: 1px solid var(--line);    /* brass hairline */
border-radius: var(--r-card);     /* 14px */
padding: var(--s-6) var(--s-6);   /* 24px */
```
Active variant adds `border-color: var(--brass)` and `box-shadow: var(--shadow-ring-brass)`.

---

## ICONOGRAPHY

Brett uses **three layered icon sources**, each for a clear purpose:

### 1. Custom SVG + multi-size PNG game HUD icons (production assets)

Five weapons live as both single-file SVGs (`assets/icons/icon-*.svg`) and PNG sizes (128 + 256 + base): **handgun · rifle · fireball · club · katana**.

- Style: monochrome brass stroke on a transparent background, drawn with a 1.4px `stroke-width`, `stroke-linecap="round"`, `stroke-linejoin="round"`, and a `viewBox="0 0 64 64"`. Each carries opacity-0.35 corner markers (`<path d="M6 10 H10 V14"/>`) as a quiet brass-frame signature — these read as cropmarks at small sizes and as ornament at large sizes.
- Usage: HUD weapon slots (28–48px), the loadout modal (32px), 256px hero cards.
- Material: rendered atop `var(--ink-800)` with brass border. Active slot adds `var(--brass-tint)` fill + brass border.

### 2. PNG illustration library — the figure-pack (production assets)

The Coaching mode is built around a library of **alpha-channel PNG illustrations** that get applied as Three.js textures or planar geometry attached to bones:

- **12 face textures** at 512×512 sRGB, mapped onto the head sphere. Each one names an emotional stance: `neutral`, `observing`, `distant`, `overwhelmed`, `protective`, `yearning`, `resolved`, `withdrawn`, `present`, `mourning`, `curious`, `blocked` (last one is a horizontal slate bar — "cannot see").
- **22 accessory PNGs** at 256×256, applied as `PlaneGeometry` parented to a named bone with an `anchorPx` offset. Groups: `hair-*` (5), clothing (5: tunic, coat, apron, robe, vest), shoes (4: boots-work, shoes-dress, sandals, barefoot), head (cap, crown, veil, blindfold), accessory (cane, satchel, shawl, swaddle).
- Every accessory carries its own `billboard: 'yAxis' | false` rule so it either faces the camera around Y (most), or pins flat to the back of the head (long hair, braid).
- The full spec lives in `_source/placement_spec.json`.

### 3. Unicode symbols as compact icons

The app deliberately leans on Unicode glyphs instead of an icon font for one-off UI affordances:

- `＋` (FULLWIDTH PLUS) — add new figure
- `▾` `▴` — dropdown caret
- `✕` — close
- `✦` — appearance / sparkle marker
- `✓` — confirm
- `●` — online dot (and live status)
- `↔` `↑` — directional arrows in game-icon prompts
- `⚙` — settings (controls panel button)
- `⚠` — boss-HP warning

Two emoji are intentional brand exceptions because they carry a whole genre: **`🤸 Mayhem`** (the mode-select hot button) and **`🌡 PHYS`** / **`🎯 IK`** (slider labels for stiffness — temperature & target as cold-system metaphors). No other emoji appear anywhere.

### What's NOT here (gaps)

This codebase had **no** general-purpose UI icon library (no Lucide, no Heroicons, no Material icons). The app gets away with this by relying on Unicode + the 5 weapon icons + the figure-pack illustrations. **If you need a general icon (e.g. a gear that isn't `⚙`, a chevron that isn't `▾`, a bell, a search glass) — substitute from Lucide Icons via CDN (`https://unpkg.com/lucide-static@latest/icons/<name>.svg`)** at 1.4px stroke to match the production weapon icons. Flag any such substitution to the team — this is a system gap to fill.

---

## INDEX

Root files:

- **`README.md`** — this file. Voice, foundations, iconography.
- **`colors_and_type.css`** — the single CSS source of truth. Import this in any new HTML and you have the full system.
- **`SKILL.md`** — agent skill manifest; describes how a design agent should use this folder.

Folders:

- **`assets/icons/`** — the 5 weapon HUD icons (SVG + 128/256 PNG).
- **`assets/figure-pack/faces/`** — 12 face PNGs.
- **`assets/figure-pack/accessories/`** — 22 accessory PNGs.
- **`assets/sprites/`** — combat sprites: blood-splat-01..04, fire-sprite (sheet), muzzle-flash, slash-arc, smoke-puff.
- **`_source/`** — original CSS + placement spec from the production codebase, preserved verbatim for reference.
- **`preview/`** — the small HTML cards that populate the Design System review tab. Each demonstrates one foundation (colors, type scale, joint markers, weapon HUD, etc.).
- **`ui_kits/coaching/`** — UI kit for the Coaching surface (topbar, presets, figure editor, status pill, appearance drawer).
- **`ui_kits/mayhem/`** — UI kit for the Mayhem surface (mode-select, loadout modal, combat HUD, co-op wave HUD, respawn overlay).

Each `ui_kits/<surface>/` contains a `README.md`, an `index.html` clickable demo, and modular JSX components.

---

## Caveats & gaps (be honest)

- **Icon system has a hole.** Outside the 5 weapons + Unicode glyphs, there's no general icon library. Lucide-via-CDN is the recommended substitute at 1.4px stroke — but the team should ratify this.
- **Fonts.** Newsreader, Geist, and Geist Mono are all on Google Fonts and the production CSS already imports them from there. No local font files are kept here — that's intentional and matches production behaviour.
- **The `figure_pack_extension/` folder** in the codebase (extra hair / clothing / shoes variants) overlaps with `figure-pack/` and uses the same filenames. This DS imports from the canonical `figure-pack/` only; the extension exists in `_source/placement_spec.json` as deltas only.
