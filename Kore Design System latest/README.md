# Kore Design System

> **Kore.** — Kubernetes, quietly run for you.
> A boutique studio for clusters that should not need attention.

This project is the design system for the **Kore.** brand and its product **Arena** (a top-down battle-royale multiplayer game). It bundles brand foundations (color, type, fonts, iconography, voice), drop-in CSS tokens, brand assets (logos, OG image, topology illustration), and a pixel-honest UI kit for the Arena game client.

---

## Sources of truth

| What | Where |
| ---- | ---- |
| Brand assets HTML (favicons, OG, topology, embedded `colors_and_type.css`) | `uploads/Kore Brand Assets.html` (extracted into `assets/`, `fonts/`, `colors_and_type.css`) |
| Arena game codebase | GitHub `Paddione/projects` @ `master`, subtree `arena/` |
| Arena `CLAUDE.md` (game architecture, asset pipeline, deployment) | imported notes — see ARENA_NOTES below |

The Brand Assets HTML is a self-bundled artifact: the actual stylesheet, fonts, and image bytes live inside it as base64 manifest entries. Everything has been unpacked into this project — no need to re-open the bundle.

---

## INDEX — what's in this folder

```
README.md                  ← you are here
SKILL.md                   ← Claude Code / Agent Skill manifest
colors_and_type.css        ← drop-in stylesheet, tokens + base type roles
fonts/                     ← Geist, Instrument Serif, JetBrains Mono (woff2)
assets/                    ← favicons, OG image, topology SVG, app icons
ui_kits/
  arena/                   ← Arena game UI recreation (lobby, HUD, results, character picker)
  marketing/               ← Kore. marketing-site primitives (hero, footer, social cards)
characters/                ← 3 "normal-people" gameplay-character mockups for Arena
preview/                   ← cards rendered into the Design System tab
```

---

## CONTENT FUNDAMENTALS — voice & copy

The Kore. voice is **quiet, dry, infrastructural**. It reads like the kind of vendor who has already turned off Slack notifications. It is the opposite of marketing-tech bombast.

**Tone**
- Calm, precise, slightly understated. Sentences are short. Adjectives are rare.
- Feels like an engineer's commit message that someone tightened up. Never excited, never breathless.
- Quiet humor through restraint, not jokes. (Tagline: "Kubernetes, quietly run for you.")

**Casing**
- Sentence case in body and section headers. **No Title Case In Marketing.**
- ALL-CAPS is reserved for monospaced eyebrows / labels / metadata: `BUILT 2026-05-05`, `[ 01 ]`, `OG · TWITTER:IMAGE`. Always with wide letter-spacing (`0.18em`) and small size (~11px).
- The brandmark is always written `Kore.` — a capital K, three lowercase letters, then a period in the **lime accent color**. The dot is a distinguishing mark; never drop it.

**Person**
- Second person (you / your) when speaking to the customer.
- First person plural (we) when describing what the studio does — but used sparingly. The studio is a thing in the world, not a personality.
- Avoid "I". This is a studio, not a single person.

**Punctuation & symbols**
- Em-dashes are common — they replace colons in headlines.
- Section numbers in brackets with spaces: `[ 01 ]`, `[ 02 ]`.
- Bullet points use middle-dot · or `→` for lists; rarely `-`.
- Long numbers and metadata get separated by `·` (e.g. `12 nodes · 2 sites`, `1200 × 630`).

**Emoji** — **No.** None in product, marketing, or assets. Replace with a small monospaced label or a lime dot when emphasis is needed.

**Examples (lifted from the brand assets)**
- Tagline: *Kubernetes, quietly run for you.*
- Description: *A boutique studio for clusters that should not need attention.*
- Section heading: *Favicon set · the < with backglow*
- Section heading: *Cluster topology · 12 nodes, 2 sites*
- Metadata row: `BUILT  2026-05-05` / `ASSETS  3 OF 3` / `DESIGN SYSTEM  KORE · v1`
- Filename caption: `assets/topology-12node.svg  · replaces 3-node`

**Italicized serif** is used for *product names, services, and quiet emphasis* — almost always inside an Instrument Serif headline, in `--lime-2`. Never bold-and-loud — always soft-and-italic.

---

## VISUAL FOUNDATIONS

### Palette
The system has **three conceptual surfaces** and **two accents**:

- **Aubergine Ink** — the dark surface family, `#120D1C → #3A2E52`. A purple-black, never neutral grey, never blue-black. Backgrounds, cards, page chrome.
- **Plasma Lime** — the single brand accent, `#C8F76A` (with `#D8FF8A` for hover, `#E6FFB0` for tints, `#6B8B1F` for print, `#2A3A0C` for ink-on-lime). Used for the dot in `Kore.`, eyebrow rules, links, primary CTAs, focus rings, and as the subtle backglow behind the favicon `<` mark.
- **Cyan / Teal** — `#5BD4D0` secondary accent for "healthy / paid / OK" states. Pairs with lime but never competes.
- **Bone Paper** — `#EDE6D8`, a warm un-yellow off-white reserved for printed surfaces, business-cards, and the rare "paper" UI.
- Foreground neutrals on dark: `--fg #ECEFF3 → --fg-soft → --mute → --mute-2`.

### Type
- **Display / headings** — *Instrument Serif* 400 (regular **and** italic). Big, generous, slightly literary. Italic is the emphasis style.
- **UI / body** — *Geist* 300/400/500/600/700.
- **Mono / metadata / eyebrows / code** — *JetBrains Mono* 400/500/600. Always uppercased and tracked-out (`0.18em`) when used as a label.

### Backgrounds
- Default surface is `--ink-900` plus a **film grain overlay** (`.grain-bg::after`, an inline SVG turbulence noise at `opacity: 0.55`, `mix-blend-mode: overlay`). The grain is non-negotiable on hero surfaces.
- Full-bleed images are uncommon. The OG image and topology illustration are technical — schematic, not photographic.
- No gradients-as-decoration. The only "gradients" are tonal ink shifts (e.g. `#120D1C → #1A1326`) used as protection behind text on busy surfaces.
- No hand-drawn illustrations. No emoji. Diagrams are technical SVG (see `assets/topology-12node.svg`).

### Layout
- A 1280-px max-width canvas, with 28px gutters. Lots of dark-on-dark whitespace.
- Section headers are a 3-column grid: `[ NN ]` / serif headline · italic kicker / mono hint, divided by a 1-px `--line` rule. **This grid is the backbone of every long-form layout.**
- Cards: `--ink-850` background, `1px solid --line`, `border-radius: 16px (--r-card)`, `padding: 24-32px`, `box-shadow` only on hover.

### Borders
- `--line: rgba(255,255,255,.07)` for default rules and card borders.
- `--line-2: rgba(255,255,255,.12)` for hover.
- `--line-3: rgba(255,255,255,.20)` for focused / strong rules.

### Shadows / elevation
- Outer: `--shadow-1` (subtle), `--shadow-2` (modal), `--shadow-paper` (paper/tactile).
- Inner: `--inner-line` (top hairline), `--inner-lime` (lime hairline on lime fills).
- Active / pressed: `--shadow-press` (small, low).

### Radii
- Pill `999px` for badges and lobby-code chips.
- Tile `22px` for hero tiles.
- Card `16px` for stacked cards (default).
- Input `10px` for fields and small buttons.
- Chip `6px` for inline metadata chips.
- Paper `4px` for the "paper" surface family.

### Hover / press
- **Hover** raises border from `--line` to `--line-2`, adds `--shadow-2`, never changes color hue. On primary CTAs (lime fill), hover lightens to `--lime-2`.
- **Press** drops to `--shadow-press` and applies `transform: translateY(1px)` — a small physical settle, no scale.
- **Focus** is a 2-px lime ring at 1px outset (`outline: 2px solid var(--lime); outline-offset: 1px`).

### Motion
- Easing: `cubic-bezier(.2,.7,.2,1)` (`--ease`). Quick in, gentle out.
- Durations: `--dur-fast 120ms` (taps), `--dur 200ms` (default), `--dur-slow 320ms` (page-level).
- No bounces. No springs. Things fade and slide, they do not spring.

### Transparency / blur
- Used for **frosted overlays only** (modal scrim: `backdrop-filter: blur(12px)` + `--ink-900` at 70% alpha).
- Avoid translucent cards. The aesthetic is matte and composed, not glassy.

### Imagery / colour vibe
- Cool, technical, slightly desaturated. Lime is the only saturated note. Renders are dark-mode-first; the topology illustration is line-art over ink.
- For Arena game art, the existing renders are **256×256 PNG**, **EEVEE-rendered, 60° iso, warm key + cool fill + rim**. Game art is allowed to be more saturated — it is the only place where colour is allowed to "pop."

### Spacing
- 4-px base scale: `s-1=4 → s-2=8 → s-3=12 → s-4=16 → s-5=20 → s-6=24 → s-8=32 → s-10=40 → s-12=48 → s-16=64 → s-20=80 → s-24=96 → s-32=128`.
- Vertical rhythm in long pages: `--s-20` (80) between sections, `--s-6` (24) inside sections.

---

## ICONOGRAPHY

Kore has **no in-house icon font**. The brand vocabulary is intentionally typographic — the "logo" is a `<` glyph (lowercase Geist) sitting on a soft lime backglow inside the rounded ink-900 tile. That's the only proprietary mark.

Where icons are needed:

1. **Always look for an existing asset first.** All Kore brand marks live in `assets/` (favicons at 16/32/180/192/512, `og-image.png`, `topology-12node.svg`).
2. **For UI iconography** the Arena codebase uses inline-SVG and emoji minimally — when an icon is required (HUD, lobby, results), reach for **[Lucide](https://lucide.dev/)** at stroke 1.75, `currentColor`, sized 16/18/20. Lucide pairs cleanly with Geist's geometry. Load via CDN `https://unpkg.com/lucide-static@latest/icons/<name>.svg` — *flagged as a substitution*: the source codebase does not ship a vendored icon set, so this is an opinionated brand decision the user should confirm.
3. **No emoji in product or marketing.** The only place emoji appear is in user-generated content (chat, lobby names) and there they are passed through as plain text — never used in chrome.
4. **Unicode glyphs are used as quiet decoration**: `·` (middle dot) for metadata separators, `—` em-dash inside headlines, `→` `↗` for "open"/"new" hints, `<` `>` for navigation.
5. **No SVG illustrations in marketing** other than the `topology-12node.svg` (technical schematic) and the favicon mark. Do not draw decorative SVGs.

For Arena's gameplay art, see `ui_kits/arena/README.md` — the game has its own sprite-render pipeline.

---

## ARENA notes (for the UI kit)

Arena is a top-down battle-royale multiplayer game. Stack: React 18 + PixiJS + Vite (frontend on :3002), Express + Socket.io + Postgres/Drizzle (backend on :3003). Three-layer backend: Routes → Services → Repositories.

Key screens (all recreated in `ui_kits/arena/`):
- **Home** — create-lobby / join-by-code / open-lobbies / leaderboard / loadout / keybinds / world campaign.
- **Lobby** — code chip, player list, ready toggle, settings (best-of, zone, items).
- **Game HUD** — HP/armor pips (HP=2 base, +1 shield), ammo, kill feed, mini-map.
- **Match results** — scoreboard, K/D, RESPECT balance.
- **Character picker** — current cast: Mage / Rogue / Tank / Warrior / Zombie. The user has now requested **3 "normal-people" mockups** (see `characters/`).

The Arena codebase ships its own utility CSS (`--color-text-muted`, `--space-md`, etc.). Where the UI kit recreates Arena components, those tokens are aliased onto the Kore design tokens for consistency — see `ui_kits/arena/arena-tokens.css`.

---

## Substitutions / things to confirm with the user

- **Icon system** — codebase has no vendored icon set; Lucide @ stroke 1.75 chosen for compatibility with Geist. Confirm or send a different system.
- **Marketing site UI kit** — built from scratch using only the brand-assets HTML; there is no marketing codebase in scope. Treat `ui_kits/marketing/` as derived, not authoritative.
- **Character mockups** — drawn as pixel-honest CSS/SVG portraits inspired by the Arena renders (60° iso, warm key + cool fill + rim). They are not Blender renders — they are **placeholders for asset-pipeline runs**. See `characters/README.md`.
