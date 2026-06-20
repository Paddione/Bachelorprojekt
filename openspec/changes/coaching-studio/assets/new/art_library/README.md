# Handoff: Mentolder Art Library

## Overview

A self-contained art library for the **Mentolder** brand — Gerald Korczewski's digital coaching practice (50+ digital · Führungskräfte-Coaching · Unternehmensberatung). Bundles the brand marks, three canonical service archetypes (sigil + offer card), the editorial portrait frame for Gerald, the stats strip with availability widget, the quote card, a 12-color project palette, six service icons, six surface tiles, the four-step process timeline, and the typography lockup. Intended to be imported into the Mentolder webapp as a tag-driven art library so the marketing site, newsletter, and print collateral all share the same vocabulary.

## About the design files

The files in this bundle are **design references created in HTML/JSX**. They are not production code to copy verbatim. Your task is to **recreate this art library in the target webapp's existing framework** (React, Vue, Svelte, Astro, etc.) using its established patterns, build pipeline, and asset conventions. If the project has no UI framework yet, **Astro + React islands** is recommended for a content-heavy coaching site — the JSX in this bundle is plain React 18 and ports cleanly.

The SVG art itself (logos, archetype sigils, icons, surface tiles) **is** intended to be used directly — extract each SVG to its own file in your asset pipeline.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, animations, and component structure are decided. Reproduce pixel-faithfully. The portfolio is the source of truth for visual decisions; the README is the source of truth for tokens, IDs, and intended usage.

## What's in this bundle

| File | Role |
|---|---|
| `Portfolio.html` | The full design reference — open it to see how every asset is meant to look in context |
| `archetypes.jsx` | The three service-archetype components (sigils + cards), the `PortraitFrame`, `QuoteCard`, `StatsStrip`, and `ProcessSteps` |
| `assets.jsx` | The two brand logos, type lockup, palette, six service icons, six surface tiles |
| `colors_and_type.css` | Design tokens (colors, type, spacing, radii, shadows, motion) |
| `logo-mark.svg`, `logo-lockup-dark.svg`, `logo-lockup-light.svg` | Static brand SVGs |
| `assets/gerald.jpg` | The editorial portrait — used inside `PortraitFrame` |

## Library shape (recommended TS interface)

```ts
type AssetKind = "archetype" | "icon" | "surface" | "logo" | "block";

type Asset = {
  id: string;             // stable slug — "digital50", "compass", "sur-01", "logo-mark"
  kind: AssetKind;
  name_de: string;        // German display label — "50+ digital", "Orientierung", "Tinte · Tief"
  name_en?: string;
  tags: string[];         // ["service", "coaching", "50plus"]
  render: (props: { size?: number; palette?: Palette }) => JSX.Element;
  preview?: string;       // optional PNG path for catalog thumbnails
};

type Archetype = Asset & {
  kind: "archetype";
  role: string;
  motto: string;
  bio: string;
  bullets: string[];
  price: string;
  unit: string;
  palette: Record<string, string>;
  sigil: (props) => JSX.Element;
  card: (props) => JSX.Element;
};
```

Export a single `library` array consumers can filter by `kind` / `tags` to populate offer pickers, navigation, sitemap headers, etc.

## Catalog (IDs you should ship)

### Service archetypes (3)

| id | name_de | role | tags | sigil anchor |
|---|---|---|---|---|
| `digital50` | 50+ digital | Einzeln · Gruppe · Pakete | service, coaching, 50plus, digital | hand-drawn "5+" |
| `leadership` | Führungskräfte-Coaching | Sparring auf Augenhöhe | service, coaching, leadership | crossed diagonals + meeting node |
| `consulting` | Unternehmensberatung | Mittelstand · Verwaltung | service, consulting, change | staircase roadmap |

Each archetype has a **sigil** (240×300, gallery-card SVG) and a **card** (sigil + name + role + motto + bio + bullets + price + swatch row). The card is what appears on the marketing site offer grid; the sigil alone may appear in newsletters and cover slides.

### Service icons (6)

| id | name_de | role |
|---|---|---|
| `compass` | Orientierung | Strategie · Klarheit |
| `handshake` | Begleitung | Coaching · Sparring |
| `briefcase` | Beratung | Unternehmen · Mandat |
| `bookmark` | Methode | Werkzeug · Notiz |
| `chat` | Erstgespräch | 30 Min. · kostenlos |
| `spark` | Veränderung | Transfer · Haltung |

All stroke-based, `currentColor`-driven, `1.4` stroke weight on a `64×64` viewBox. Use `color: var(--brass)` to render in the brand accent.

### Surface tiles (6)

| id | name_de | role |
|---|---|---|
| `sur-01` | Tinte · Tief | Seitensubstrat |
| `sur-02` | Messing-Halo | Hero · CTA |
| `sur-03` | Stille-Blau | Schatten · Tiefe |
| `sur-04` | Hairline-Gitter | Strip · Karte |
| `sur-05` | Duotone · Porträt | Bild · Wash |
| `sur-06` | Salbei-Puls | Verfügbarkeit · Live |

Each is a 240×160 SVG that documents how light behaves on a brand substrate. Use them as moodboard reference, hero backdrops, or section dividers.

### Editorial blocks (4)

| id | component | usage |
|---|---|---|
| `block-portrait` | `PortraitFrame` | Hero · About · Footer-byline |
| `block-quote` | `QuoteCard` | Mid-page · Newsletter pull-quote |
| `block-strip` | `StatsStrip` | Below-hero · Print one-pager |
| `block-process` | `ProcessSteps` | Methodology · Onboarding page |

### Logos (2 + 3)

| id | name | source |
|---|---|---|
| `logo-mark` | App Icon · Brass-Mark | `assets.jsx` → `LogoMark` |
| `logo-pulse` | Animated · Brass-Pulse | `assets.jsx` → `LogoBrassPulse` |

Plus the three static brand SVGs:

- `logo-mark.svg` — square mark
- `logo-lockup-dark.svg` — wordmark on ink
- `logo-lockup-light.svg` — wordmark on paper

## Design tokens

All values live in `colors_and_type.css`. The pieces the art library actually depends on:

### Colors

```
--ink-900: #0b111c     /* page substrate */
--ink-850: #101826     /* card surface */
--ink-800: #17202e     /* nested panel · inputs */
--brass:   oklch(0.80 0.09 75)   /* primary accent — warm gold */
--brass-2: oklch(0.86 0.09 75)   /* hover / italic em */
--brass-print: #8a6a2a            /* CMYK-safe brass for print */
--sage:    oklch(0.80 0.06 160)  /* availability · live · ok */
--fg:      #eef1f3                /* primary text */
--fg-soft: #cdd3d9                /* secondary text */
--mute:    #8c96a3                /* tertiary text · mono labels */
--line:    rgba(255,255,255,.07)  /* hairline */
--line-2:  rgba(255,255,255,.12)  /* hover hairline */
--fail:    #d77a6e                /* warning · Tonrot */
--info:    #6fa8d8                /* link · Stille-Blau */
```

### Per-archetype palettes (for skinning / variants)

```ts
digital50:  { ink:"#0b111c", surface:"#101826", accent:"#d7b06a", accent2:"#f0d28c",
              soft:"#a8c9b0", line:"rgba(255,255,255,0.12)" }
leadership: { ink:"#0b111c", surface:"#17202e", accent:"#d7b06a", accent2:"#f0d28c",
              soft:"#a8c9b0", line:"rgba(255,255,255,0.12)" }
consulting: { ink:"#0b111c", surface:"#1d2736", accent:"#d7b06a", accent2:"#f0d28c",
              soft:"#6fa8d8", line:"rgba(255,255,255,0.12)" }
```

The 12-color project palette lives in `assets.jsx` (`PALETTE` array) — each entry has `hex`, `name` (German), and `role`.

### Type

- **Newsreader** — display, headlines, archetype names, blockquote, italic em
- **Geist** — body, lede, button labels, list items
- **Geist Mono** — eyebrows, IDs, mono captions, slot pills (always uppercase + 0.18em tracking)
- All loaded from Google Fonts at the top of `colors_and_type.css`

Italic in Newsreader is the **only** way the brand emphasizes — color (`var(--brass-2)`) reinforces it. No bold italic. No underline.

### Spacing / radii / motion

- 4px spacing base, scale `--s-1 … --s-32`
- Radii: pill 999, card 22, tile 16, input 10, paper 4, chip 6
- Single ease everywhere: `cubic-bezier(.2,.7,.2,1)` at 120 / 200 / 320ms
- Pulse animation (`pulse-ring-1/2/3` + `core-glow`) is required for the Brass-Pulse logo and the StatsStrip availability dot — keyframes are inline in `Portfolio.html`

## Components & behavior

### Archetype render contract

Every archetype exports a sigil SVG component that accepts `{ p }` (palette object). They are pure SVG — no external assets, no fonts. Embed them or extract to standalone `.svg` per archetype via your build.

- **Sigil**: 240×300 viewBox. Editorial mark for the offer card, newsletter, cover slide.
- **Card**: combines sigil + copy + price into a flex-column card; bullets render with brass dots.

### Portrait frame

`PortraitFrame` accepts `{ src }` defaulting to `assets/gerald.jpg`. It wraps the image in:
- a brass radial halo (top-right) and a stille-blau halo (bottom-left)
- a 1px brass hairline along the top edge
- a soft-light duotone overlay (sepia .18 on the image, ink-blue gradient toward the bottom)
- a status pill ("Anno 2026 · Lüneburg") with a sage pulse dot
- a caption row underneath: `GK · 01 — Gerald Korczewski / COACH & DIGITALER BEGLEITER — 65 J. · DE`

The portrait must use `object-position: center 18%` so Gerald's eyes sit on the upper third.

### Stats strip

`StatsStrip` is a two-column block:
- Four stats with serif numerals + brass `+` and uppercase mono labels.
- An availability widget with a pulsing sage dot, the next-free-appointment line, and four time-slot pills + an "→ alle Termine" link.

The pulse dot animation (`m-pulse`) is defined in `Portfolio.html` — port it to global CSS.

### Logo animations

`LogoBrassPulse` requires the same keyframes as the Korczewski Radar-Pulse — they're already brand-agnostic:

```css
@keyframes pulse-ring { 0% { opacity: 0.6; r: 28; } 100% { opacity: 0; r: 70; } }
@keyframes glow-core  { 0%,100% { opacity: 1; } 50% { opacity: 0.75; } }
.pulse-ring-1 { animation: pulse-ring 2.4s ease-out infinite; }
.pulse-ring-2 { animation: pulse-ring 2.4s ease-out infinite 0.8s; }
.pulse-ring-3 { animation: pulse-ring 2.4s ease-out infinite 1.6s; }
.core-glow    { animation: glow-core 2.2s ease-in-out infinite; }
```

Move these into a global stylesheet so the logo works anywhere.

## State management (consumer side)

The library itself is stateless. The webapp consuming it needs:

- **selectedArchetype** — which offer is being viewed / inquired about
- **bookingSlots** — array of `{ datetime, available }` powering the StatsStrip
- **inquiry** — `{ archetypeId, name, email, message, slot? }` for the contact form
- **locale** — `de` (default) | `en` (future)

The current marketing site's three-card offer grid maps directly to `ARCHETYPES.map(ar => <ArchetypeCard ar={ar}/>)`.

## Implementation steps for Claude Code

1. **Set up tokens** — port `colors_and_type.css` into the target framework (CSS variables, Tailwind theme, or styled-system tokens — whatever the project uses).
2. **Extract SVGs** — convert each archetype sigil, icon, and surface tile into a standalone component or `.svg` file. Keep the per-archetype palette as data so colors can be tweaked at runtime.
3. **Build the library index** — a single `library.ts` exporting the typed `Asset[]`, ideally one file per kind (`archetypes.ts`, `icons.ts`, `surfaces.ts`, `blocks.ts`, `logos.ts`).
4. **Logo + pulse animations** — move the keyframes to global CSS; the Brass-Pulse and the StatsStrip availability dot must animate.
5. **Portrait pipeline** — provide `gerald.jpg` and any future portraits at min. 1200×1500, B&W or warm-grey, eyes on upper third. The duotone wash is applied entirely in CSS — do not pre-bake.
6. **Verify against `Portfolio.html`** — render each library entry and visually diff against the reference.

## Notes / caveats

- **Locale.** Display names and copy are German. Add `name_en` keys when the bilingual site lands. Suggested EN names: "50+ digital", "Leadership Coaching", "Management Consulting"; "Compass, Handshake, Briefcase, Bookmark, Chat, Spark".
- **Italic em is the only emphasis.** Don't introduce bold for emphasis — the brand voice is quiet and editorial. Bold is reserved for `<strong>` inside lists where Geist 600 reads naturally.
- **No emoji, no Unicode icons.** Status uses small colored dots + uppercase mono labels (`OK`, `LIVE`, `WIP`, `IM BAU`). Sage = available, brass = pending, tonrot = warning.
- **Film grain.** The reference page uses a fixed-position SVG noise overlay at `opacity .55, mix-blend-mode: overlay`. Optional but defining for the brand mood — keeps the deep-ink surface from looking flat.
- **Portrait halo asymmetry is intentional.** Brass top-right, stille-blau bottom-left — never reversed. The hairline is always on the top edge.
- **"mentolder." with the period.** The wordmark always ends in a brass period. Treat it as part of the mark; never drop it.
- **Print brass.** Use `--brass-print: #8a6a2a` for any CMYK output — the OKLCH brass is screen-only.
