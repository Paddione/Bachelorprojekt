# Handoff: Korczewski Art Library

## Overview

A self-contained art library for a Korczewski tabletop board webapp. Bundles the brand marks, four canonical character figurines (portrait + token render), a board preview, a 12-color project palette, six prop tokens, six terrain swatches, and a typography lockup. Intended to be imported into a webapp as a tag-driven art library so the prototype board can replace its abstract shape tokens (Figur / Kegel / Säule / Raute) with real characters and props.

## About the design files

The files in this bundle are **design references created in HTML/JSX**. They are not production code to copy verbatim. Your task is to **recreate this art library in the target webapp's existing framework** (React, Vue, Svelte, etc.) using its established patterns, build pipeline, and asset conventions. If the project has no UI framework yet, React + Vite is recommended — the JSX in this bundle is plain React 18 and ports cleanly.

The SVG art itself (logos, character glyphs, props, terrain tiles) **is** intended to be used directly — extract each SVG to its own file in your asset pipeline.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, animations, and component structure are decided. Reproduce pixel-faithfully. The prototype is the source of truth for visual decisions; the README is the source of truth for tokens, IDs, and intended usage.

## What's in this bundle

| File | Role |
|---|---|
| `Portfolio.html` | The full design reference — open it to see how every asset is meant to look in context |
| `characters.jsx` | The four character components (portraits + figurines) and the `BoardPreview` |
| `assets.jsx` | The two K logos, palette, props, terrain swatches, typography lockup |
| `colors_and_type.css` | Design tokens (colors, type, spacing, radii, shadows, motion) |
| `logo-mark.svg`, `logo-lockup-dark.svg`, `logo-lockup-light.svg` | Static brand SVGs |

## Library shape (recommended TS interface)

```ts
type AssetKind = "character" | "prop" | "terrain" | "logo";

type Asset = {
  id: string;             // stable slug — "elara", "chest", "ter-01", "logo-app-icon"
  kind: AssetKind;
  name_de: string;        // German display label — "Elara", "Truhe", "Wald"
  name_en?: string;
  tags: string[];         // ["character", "fantasy", "feminine", "magic-user"]
  render: (props: { size?: number; palette?: Palette }) => JSX.Element;
  preview?: string;       // optional PNG path for catalog thumbnails
};

type Character = Asset & {
  kind: "character";
  role: string;
  bio: string;
  palette: Record<string, string>; // see per-character palette in characters.jsx
  portrait: (props) => JSX.Element;
  figurine: (props) => JSX.Element; // the board token
};
```

Export a single `library` array consumers can filter by `kind` / `tags` to populate token pickers, character-sheet headers, etc.

## Catalog (IDs you should ship)

### Characters (4)

| id | name_de | role | tags | silhouette anchor |
|---|---|---|---|---|
| `elara` | Elara | Herbalist · Witch of the Greenwood | character, magic, feminine, green-dress, red-hair | flowing long hair |
| `korrin` | Korrin | Mendicant Cleric of the Quiet Order | character, support, hooded, bald | round bald head + hood |
| `vex` | Vex | Tricorn Rogue · Letter-Carrier | character, rogue, masked, slim | tricorn hat point |
| `brann` | Brann | Forge-Knight · House Hammerfall | character, tank, dwarf, horned | wide horned helm |

Each character has both a **portrait** (240×300, gallery card) and a **figurine** (120×200, board token with cast shadow). The figurine is what sits on the board.

### Props (6)

| id | name_de | tags |
|---|---|---|
| `chest` | Truhe | item, container, loot |
| `torch` | Fackel | light, fire |
| `potion` | Trank | item, consumable, magic |
| `key` | Schlüssel | item, unlock |
| `scroll` | Schriftrolle | item, magic, knowledge |
| `coin` | Münze | currency, marker |

### Terrain swatches (6)

| id | name_de | tags |
|---|---|---|
| `ter-01` | Wald | nature, forest, green |
| `ter-02` | Stein | stone, ground, gray |
| `ter-03` | Wasser | water, blue |
| `ter-04` | Holzdiele | wood, indoor |
| `ter-05` | Schnee | cold, white |
| `ter-06` | Sand | desert, warm |

### Logos (2 + 3)

The hero pieces are the **two animated SVG logos** the user picked from earlier explorations:

| id | name | source |
|---|---|---|
| `logo-app-icon` | App Icon · Vollständiges K | `assets.jsx` → `LogoAppIcon` |
| `logo-radar-pulse` | Animated · Radar-Pulse | `assets.jsx` → `LogoRadarPulse` |

Plus the three static brand SVGs already in `colors_and_type.css`'s ecosystem:

- `logo-mark.svg` — square mark
- `logo-lockup-dark.svg` — wordmark on dark
- `logo-lockup-light.svg` — wordmark on paper (left vertical bar intentionally removed — keep it that way)

## Design tokens

All values live in `colors_and_type.css`. The pieces the art library actually depends on:

### Colors

```
--ink-900: #120D1C   /* board / app substrate */
--ink-850: #1A1326   /* card surface */
--ink-800: #221932   /* nested surface */
--copper:  #C8F76A   /* primary accent (lime) */
--copper-2:#D8FF8A   /* hover accent */
--teal:    #5BD4D0   /* health / live / sigil */
--paper:   #EDE6D8   /* paper docs only */
--fg:      #ECEFF3   /* primary text */
--fg-soft: #C6CCD4   /* secondary text */
--mute:    #8A93A0   /* tertiary text */
--line:    rgba(255,255,255,.07)   /* hairline */
--line-2:  rgba(255,255,255,.12)   /* hover hairline */
```

### Per-character palettes (for skinning / variants)

```ts
elara:  { skin:"#F2D2B8", skin2:"#D9A37E", hair:"#C0341D", hair2:"#7A1A0E",
          dress:"#3D8A4F", dress2:"#22542F", trim:"#C8F76A", eye:"#2A3A0C" }
korrin: { skin:"#C8966E", skin2:"#9A6E4A", robe:"#3A3148", robe2:"#221932",
          trim:"#D8AE5A", inner:"#5BD4D0", eye:"#1A1326" }
vex:    { skin:"#E8C5A3", skin2:"#B98A65", hat:"#15101F", hat2:"#0A0710",
          coat:"#5C2E2A", coat2:"#341614", mask:"#0F0B18", trim:"#C8F76A",
          eye:"#C8F76A" }
brann:  { armor:"#6B7480", armor2:"#3C434C", armor3:"#A8B0BB",
          beard:"#C26A2A", beard2:"#7A3A14", horn:"#E8DCC0", horn2:"#9A8A66",
          inner:"#E26B6B", trim:"#C8F76A" }
```

The 12-color project palette lives in `assets.jsx` (`PALETTE` array) — each entry has `hex`, `name` (German), and `role`.

### Type

- **Instrument Serif** — headlines, character names, numerals
- **Geist** — body, lede, button labels
- **JetBrains Mono** — eyebrows, IDs, labels (always uppercase + 0.18em tracking)
- All loaded from Google Fonts at the top of `colors_and_type.css`

### Spacing / radii / motion

- 4px spacing base, scale `--s-1 … --s-32`
- Radii: pill 999, tile 22, card 16, input 10, paper 4, chip 6
- Single ease everywhere: `cubic-bezier(.2,.7,.2,1)` at 120 / 200 / 320ms
- Pulse animation (`pulse-ring-1/2/3` + `core-glow`) is required for the Radar-Pulse logo — keyframes are inline in `Portfolio.html`

## Components & behavior

### Character render contract

Every character exports two SVG components that accept `{ p }` (palette object). They are pure SVG — no external assets, no fonts. Embed them or extract to standalone `.svg` per character via your build.

- **Portrait**: 240×300 viewBox. Gallery / character-sheet use.
- **Figurine**: 120×200 viewBox, includes a baked-in `<ellipse>` cast shadow at the bottom. Sits flush on the board surface.

### Board preview

`BoardPreview` in `characters.jsx` arranges the four figurines on a wood-grain plinth with a slight `rotateX(20deg)` perspective. This is the visual replacement for the user's current shape-token board.

### Logo animations

`LogoRadarPulse` requires the three keyframes in `Portfolio.html`:

```css
@keyframes pulse-ring { 0% { opacity: 0.6; r: 28; } 100% { opacity: 0; r: 72; } }
@keyframes glow-core  { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
.pulse-ring-1 { animation: pulse-ring 2.4s ease-out infinite; }
.pulse-ring-2 { animation: pulse-ring 2.4s ease-out infinite 0.8s; }
.pulse-ring-3 { animation: pulse-ring 2.4s ease-out infinite 1.6s; }
.core-glow    { animation: glow-core 2s ease-in-out infinite; }
```

Move these into a global stylesheet so the logo works anywhere. Note the `r` keyframe — required for the SVG circle-radius animation.

## State management (consumer side)

The library itself is stateless. The webapp consuming it needs:

- **selectedToken** — which character is being placed on the board
- **tokenInstances** — placed tokens with `{ characterId, x, y, color?, size? }`
- **propInstances** — placed props with `{ propId, x, y }`
- **terrainCells** — board grid `{ [cellId]: terrainId }`

The current prototype's "Figur / Kegel / Säule / Raute" + color picker UI maps directly to a character picker + (optional) character-recolor picker.

## Implementation steps for Claude Code

1. **Set up tokens** — port `colors_and_type.css` into the target framework (CSS variables, Tailwind theme, or styled-system tokens — whatever the project uses).
2. **Extract SVGs** — convert each character (portrait + figurine), prop, and terrain swatch into a standalone component or `.svg` file. Keep the per-character palette as data so colors can be tweaked at runtime.
3. **Build the library index** — a single `library.ts` exporting the typed `Asset[]`, ideally one file per kind (`characters.ts`, `props.ts`, `terrain.ts`, `logos.ts`).
4. **Logo animations** — move the keyframes to global CSS; the Radar-Pulse must animate.
5. **Token picker UI** — replace the current shape-button row (Figur / Kegel / Säule / Raute) with a character picker that uses `figurine` previews.
6. **Verify against `Portfolio.html`** — render each library entry and visually diff against the reference.

## Notes / caveats

- **Locale.** Display names are German. If the webapp is bilingual, add `name_en` keys (suggestions: Elara, Korrin, Vex, Brann; Chest, Torch, Potion, Key, Scroll, Coin; Forest, Stone, Water, Wood, Snow, Sand).
- **Art origin.** Characters and props are stylized SVG illustrations, not real 3D models. They are intended as canonical art-direction references — when real 3D models are commissioned, the per-character palette + portrait should be the brief.
- **Light lockup.** The left vertical bar was removed from `logo-lockup-light.svg` per the user's request. The K is now formed by two diagonals meeting at the core. Keep it that way.
- **No emoji, no Unicode icons.** Status uses small colored dots + uppercase mono labels (`SYNC`, `OK`, `FAIL`).
- **Film grain.** The reference page uses a fixed-position SVG noise overlay at `opacity .55, mix-blend-mode: overlay`. Optional but defining for the brand mood.
