# Handoff: Mentolder Homepage Redesign

## Overview
A polished hi-fi redesign of the Mentolder homepage (`src/pages/index.astro`), evolving the existing dark-navy + gold visual system toward a calmer, warmer, more editorial execution. The design is intended as a **shared system** that also applies to the sibling brand `korczewski.de` — tokens and components are brand-agnostic; only copy + config differ between brands.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing the intended look, layout, typography, spacing, and component behavior. They are **not production code to copy directly**.

The target environment for this project is the existing **Astro + Svelte** codebase under `src/` (Tailwind v4, global tokens in `src/styles/global.css`, brand configs in `src/config/brands/*.ts`, components in `src/components/*.svelte` and `.astro`, layout in `src/layouts/Layout.astro`).

The task is to **recreate the HTML design in that existing environment**, using Astro pages, Svelte components, Tailwind utility classes, and the brand-config pattern already established (`getEffectiveHomepage()`, `getEffectiveServices()`, etc.). Existing components (`Hero.svelte`, `ServiceCard.svelte`, `Navigation.svelte`, `FAQ.svelte`, `CallToAction.svelte`) should be **refactored or replaced** to match the new system, not left alongside it.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and interactions are all deliberate and should be matched pixel-perfectly. Any deviation should be a conscious decision (e.g. accessibility, Tailwind class constraints), not an accident.

---

## Screens / Views

There is **one screen** in this handoff: the **Homepage** (`/`). It is composed of sections, in order from top to bottom.

### 0. Sticky Top Bar (`<header class="topbar">`)
- **Purpose:** primary navigation + persistent CTA.
- **Layout:** 72px tall, full-width sticky (top:0, z-index 30). Flex, `space-between`, centered vertically. Inner content constrained to `max-width: 1240px`, horizontal padding 40px (22px on mobile).
- **Background:** `linear-gradient(to bottom, rgba(11,17,28,0.92), rgba(11,17,28,0.72))` with `backdrop-filter: blur(14px) saturate(1.1)`.
- **Border-bottom:** `1px solid rgba(255,255,255,0.07)` (token `--line`).
- **Left — brand mark:**
  - 30×30px rounded-8px square with radial brass gradient (`radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%)`), inner 1px white highlight, outer 1px black ring.
  - An inner "M" silhouette carved out via `clip-path` on a `::after` pseudo filled with `--ink-900`.
  - Followed by wordmark "mentolder." in Newsreader 20px, letter-spacing −0.01em. The trailing "." is brass.
- **Center/right — nav links:** `Angebote`, `Über mich`, `Referenzen`, `Kontakt` — Geist 14px / 500, color `--fg-soft`, hover → `--fg`. Active link is `--brass`.
- **Meta pill:** Geist Mono 11px, `--mute`, letter-spacing 0.06em — text: `Lüneburg · DE`.
- **Primary CTA:** pill button, `--brass` background, `--ink-900` text, 10px/16px padding, 13px / 600, `→` arrow icon (stroke 2, 14×14). Hover → `--brass-2`.
- **Mobile (≤860px):** nav is hidden. (Implementation should add a hamburger menu — the current Navigation.svelte already has a mobile menu pattern; reuse it.)

### 1. Hero (`<section class="hero">`)
- **Purpose:** establish tone + primary conversion.
- **Layout:** `padding: 76px 0 120px` (56px / 80px on mobile). Two-column grid `1.15fr .85fr`, gap 64px, `align-items: end`. Collapses to single column below 960px.
- **Left column:**
  - **Kicker row:** Geist Mono 11px caps, letter-spacing 0.18em, color `--mute`. Structure: 44px × 1px brass bar · `Digital Coaching` · 5px sage dot · `Führungskräfte-Beratung`. Margin-bottom 26px.
  - **H1:** Newsreader 300–350, `clamp(44px, 6.2vw, 88px)`, line-height 1.02, letter-spacing −0.02em. Italicized accent phrase is Newsreader italic 400 in `--brass-2`. Copy: `Menschen, Prozesse und Technik` + italic `wieder verbinden.`
  - **Lede:** 18px / 1.6, `--fg-soft`, max 52ch, margin-top 20px.
  - **CTA row (margin-top 36px, gap 14px):**
    - Primary pill: "Kostenloses Erstgespräch" + arrow, `--brass` bg, `--ink-900` text, 14×22 padding, 14px / 600. Hover: `--brass-2` + `translateY(-1px)`.
    - Ghost pill: "Angebote ansehen", 1px `--line-2` border, `--fg` text. Hover: border + text → `--brass`.
- **Right column:** Portrait frame (see below).
- **Background atmosphere:** Absolutely positioned `.bg-halo` — two radial blobs (warm brass top-right, cool ink-blue bottom-left) sit behind the content at z-index 0. A fixed-position SVG film-grain layer (fractalNoise, baseFreq 0.9, opacity .08, `mix-blend-mode: overlay`) covers the viewport at z-index 1.

#### Portrait component (reusable — call it `<Portrait>`)
- **Container:** `max-width: 460px`, aspect-ratio 4/5, right-aligned, padding-right 18px.
- **Halo A (behind, right shoulder):** absolutely positioned, `right:-8%; top:6%; width:90%; height:90%`, `border-radius:50%`, `radial-gradient(closest-side, oklch(0.80 0.09 75 / .45), transparent 70%)`, `filter: blur(8px)`, z-index −1.
- **Halo B (cool, bottom-left):** `left:-6%; bottom:12%; width:55%; height:55%`, radial cool `oklch(0.60 0.05 250 / .45)`, `filter: blur(18px)`.
- **Vertical hairline:** `::before` on the wrapper — 1px wide, 2px from the right edge, runs from `top:-16px` to `bottom:-40px`, `linear-gradient(to bottom, transparent, var(--line-2) 20%, var(--line-2) 80%, transparent)`.
- **Frame:** the image itself, `border-radius: 4px`, `overflow: hidden`, box-shadow `0 40px 80px -30px rgba(0,0,0,.75), 0 2px 0 0 rgba(255,255,255,.04), inset 0 0 0 1px var(--line-2)`.
  - **`img`:** fills container, `object-fit: cover`, `object-position: center 18%`, filter `contrast(1.04) brightness(1.02) sepia(.18) saturate(1.05)`. On hover: filter bumps to `contrast(1.06) brightness(1.04) sepia(.22) saturate(1.08)` + `transform: scale(1.015)` over 0.8s.
  - **Duotone wash (`::before`):** `linear-gradient(180deg, oklch(0.80 0.09 75 / .10) 0%, transparent 40%, oklch(0.18 0.02 250 / .35) 100%)` with `mix-blend-mode: soft-light`.
  - **Brass hairline top (`::after`):** 1px, `linear-gradient(to right, transparent, oklch(0.80 0.09 75 / .7) 30%, oklch(0.80 0.09 75 / .7) 70%, transparent)`.
- **Tag plate (top-left):** rounded pill `top:14px; left:14px`, Geist Mono 10px caps, letter-spacing 0.18em, background `rgba(11,17,28,.55)` + `backdrop-filter: blur(6px)`, 1px `rgba(255,255,255,.12)` border, 6/10 padding. Leading 6px sage dot with `0 0 0 3px` sage halo. Text: `Anno 2026 · Lüneburg`.
- **Caption plate (below frame):** margin-top 18px, 1px `--line` top border, padding-top 14px. 3-column grid `auto 1fr auto`, gap 16px:
  - Left: `GK · 01` — Geist Mono 10px / 0.18em, `--brass`, caps.
  - Middle: name "Gerald Korczewski" in Newsreader 16px `--fg`, followed by role "Coach & digitaler Begleiter" in Geist Mono 10px / 0.14em, `--mute`, caps.
  - Right: `65 Jahre · DE` — Geist Mono 10px / 0.14em, `--mute`, caps.

### 2. Stats + Availability Strip (`<section class="strip">`)
- **Purpose:** trust indicators + immediate booking hook.
- **Layout:** two-column grid `1.1fr .9fr`, border-bottom `1px solid --line`, no gap. Collapses to single column below 960px.
- **Left — Stats (4 cells, `repeat(4, 1fr)`):** each cell 38px/28px padding, 1px `--line` divider between cells, 1px `--line` divider from Availability on the right.
  - Number: Newsreader 44px / 1 / −0.02em, `--fg`. Small accent characters (`+`, `KI`) become `<em>` in `--brass`, non-italic.
  - Label: Geist Mono 11px / 0.14em caps, `--mute`.
  - Data (from `homepage.stats`):
    - `30 +` — Jahre Führung
    - `50 +` — Teilnehmer begleitet
    - `40` — Jahre IT & Sicherheit
    - `KI` — Pionier der ersten Stunde
- **Right — Availability:** 32/40 padding, flex-col, gap 14px.
  - Row: 10px sage pulsing dot (`@keyframes pulse`, 2.2s infinite, box-shadow ring expanding to 10px and fading) + title + sub.
  - Title: Geist 600 `--fg` — "Nächste freie Termine".
  - Sub: Geist 14px `--mute` — e.g. "Di. 21. April · kostenloses Erstgespräch (30 Min.)".
  - Slot pills: Geist Mono 12px, 7/12 padding, 1px `--line-2` border, `--fg-soft`. Hover → border + text `--brass`. Content: `09:30`, `11:00`, `14:30`, `16:00`, `→ alle Termine`. **Implementation:** feed from `getAvailableSlots()` (existing CalDAV helper).

### 3. Offers (`<section id="angebote" class="section">`)
- **Purpose:** three service propositions.
- **Section-level:** padding 120px 0 (80px on mobile).
- **Section head:** 2-col grid `1fr 1.2fr`, gap 48px, margin-bottom 72px, `align-items: end`. Collapses below 860px.
  - Left: `.eyebrow` ("Meine Angebote") — Geist Mono 11px / 0.18em caps, `--brass`, preceded by 22×1px brass bar. + H2 Newsreader, max-width 18ch. Copy: "Drei Wege, an denen ich Sie begleite."
  - Right: 18px / 1.6 `--fg-soft`, max 52ch.
- **Offers list:** column, each item a row. Row layout: `grid-template-columns: 80px 1fr 1.6fr 220px 140px`, gap 36px, padding 36px 0, top + bottom `1px --line` border, hover background `linear-gradient(to right, transparent, rgba(232,200,112,.03) 40%, transparent)`.
  - Col 1: number `01`/`02`/`03` — Geist Mono 12px / 0.1em, `--mute`.
  - Col 2: title (Newsreader 28px / 400 / −0.015em) + small sage meta label underneath in Geist Mono 11px caps (e.g. "Einzeln · Gruppe · Pakete", "Sparring auf Augenhöhe", "Mittelstand · Verwaltung").
  - Col 3: description (15px / 1.6 `--fg-soft`) + bulleted feature list. Bullets: custom 4×4 brass dot via `::before` translateY(-3px), gap 10px, list items Geist 13px `--mute`.
  - Col 4: price block — border-left `1px --line`, padding-left 24px. Price Newsreader 26px `--fg`, unit Geist Mono 11px / 0.1em caps `--mute`.
  - Col 5: "Mehr →" link — Geist 13px / 500 `--brass` + 34×34px circle icon button with 1px `--line-2` border. On row hover, circle fills with `--brass`, icon becomes `--ink-900`.
- **Responsive (≤1000px):** collapses to 3-column grid `40px 1fr 140px`, description + list spans full width, price takes col 2, "Mehr" takes col 3.
- **Data (from `homepage.services` / brand config):**
  - `01 — 50+ digital` — ab 60 € / pro Stunde
  - `02 — Führungskräfte-Coaching` — 150 € / pro Session · 90 Min.
  - `03 — Unternehmensberatung` — nach Vereinbarung / 3–12 Monate
- **The existing `ServiceCard.svelte` should be replaced by this row component** (call it `ServiceRow.svelte`).

### 4. Why Me (`<section id="ueber" class="why section">`)
- **Section chrome:** background `--ink-850`, top+bottom `1px --line` borders. Padding 120px 0.
- **Layout:** 2-col grid `1fr 1fr`, gap 80px, `align-items: start`. Collapses below 960px.
- **Left:**
  - Eyebrow "Warum ich?".
  - H2 with italic accent: "Ich kenne beide Welten — die etablierten Strukturen und die modernsten *Werkzeuge*." Max 18ch.
  - Lede 20px / 1.55 `--fg-soft`, max 56ch.
  - **Points list** — top border, each item 26px top/bottom padding, bottom `1px --line`, 2-col grid `56px 1fr`, gap 22px.
    - Left: number "01"/"02"/"03" — Geist Mono 11px / 0.14em caps `--brass`, padding-top 6px.
    - Right: h4 (Geist 17px / 600) + p (14px / 1.6 `--mute`).
  - Copy from `homepage.whyMePoints` (exists in brand config).
- **Right — Quote card:**
  - Container: border-radius 22px, 1px `--line-2` border, background `radial-gradient(circle at 0% 0%, oklch(0.80 0.09 75 / .12), transparent 50%), var(--ink-800)`. Padding 44/44/40/44.
  - Decorative large italic opening quote glyph (Newsreader italic 120px, `--brass` opacity .4) absolutely positioned top 30 left 30.
  - Blockquote: Newsreader italic 350, 26px / 1.35 / −0.01em, `--fg`, margin 32/0/28/0. Copy from `homepage.quote`.
  - Byline: top `1px --line` border, padding-top 20px, flex gap 14 — 44×44 brass gradient avatar with "GK" initials (Newsreader 16, `--ink-900`), inset 1px white highlight, + name (Geist 600 15 `--fg`) + role (Geist 13 `--mute`).

### 5. Process (`<section class="process">`)
- **Section chrome:** padding 80px 0, top+bottom `1px --line`, background `linear-gradient(180deg, transparent, rgba(255,255,255,.015)), var(--ink-900)`.
- **Layout:** wrap is 2-col grid `1fr 2.5fr`, gap 64px, `align-items: center`. Collapses below 960px.
- **Left:** eyebrow "So arbeiten wir" + H2 "Vier ruhige Schritte." (Newsreader 28px / 400).
- **Right — steps rail:** `grid-template-columns: repeat(4, 1fr)`, gap 24px. (On ≤720px: 2 cols.)
  - Rail line: absolute `::before`, `top: 14px`, full width, 1px, `linear-gradient(to right, var(--line), var(--brass) 20%, var(--brass) 80%, var(--line))`, opacity 0.4.
  - Each step: padding-top 40px. Dot at `top:8px; left:0`: 14×14 circle, `--ink-900` bg, 1px brass border, inner 3px `--brass` fill via `::after`.
  - Num: Geist Mono 10px / 0.16em caps, `--brass`. Format `01 — Erstgespräch`.
  - H4: Geist 15px / 600.
  - P: Geist 13px / 1.6 `--mute`.
- **Copy:**
  1. `01 — Erstgespräch` · **Kennenlernen** · 30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung.
  2. `02 — Klarheit` · **Zieldefinition** · Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?
  3. `03 — Begleitung` · **Arbeitsphase** · Individuelle Sessions in Ihrem Tempo – online oder vor Ort in Lüneburg und Umgebung.
  4. `04 — Transfer` · **Nachhaltigkeit** · Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung.

### 6. CTA (`<section id="termin" class="cta">`)
- **Layout:** padding 130px 0, top `1px --line`, relative + `overflow: hidden`. Content centered, max-width 760px, `text-align: center`.
- **Background glow:** `::before` absolute full, `radial-gradient(ellipse at 50% 100%, oklch(0.80 0.09 75 / .16), transparent 60%)`.
- **Content:**
  - Centered eyebrow "Kostenloses Erstgespräch".
  - H2 `clamp(36px, 4.6vw, 60px)` Newsreader 350: "In 30 Minuten wissen wir, *ob es passt.*" (italic accent `--brass-2`).
  - Paragraph 18px `--fg-soft`, max 54ch: "Kein Verkaufsgespräch. Kein Druck. Nur Klarheit. Wo stehen Sie – und wie könnte eine Zusammenarbeit konkret aussehen?"
  - Button row gap 14px, margin-top 36px: primary pill "Termin vorschlagen" + ghost pill "info@mentolder.de".

### 7. Footer (`<footer>`)
- Background `--ink-850`, top `1px --line`, padding 72px 0 36px.
- **Foot grid:** `grid-template-columns: 1.4fr repeat(3, 1fr)`, gap 48px, margin-bottom 56px. Collapses to `1fr 1fr` below 860px.
  - Col 1 — brand + tagline (`--fg-soft` 14px, max 32ch).
  - Col 2 — Kontakt (phone, email, "Lüneburg und Umgebung").
  - Col 3 — Angebote links.
  - Col 4 — Rechtliches links (Referenzen, Impressum, Datenschutz, AGB, Barrierefreiheit).
- Section headings `h5`: Geist Mono 11px / 0.16em caps, `--brass`, margin-bottom 18px.
- Links: Geist 14px `--mute`, hover `--fg`, block, margin-bottom 8px.
- **Foot bottom:** top `1px --line`, padding-top 24px, flex `space-between`, Geist Mono 11px / 0.08em caps `--mute-2`. Left: "© 2026 Mentolder — Alle Rechte vorbehalten". Right: "Gestaltet in Lüneburg · DE".

---

## Interactions & Behavior
- **Sticky header** — `position: sticky; top: 0; z-index: 30;` with blur backdrop. When scrolled, content underneath bleeds through the translucent gradient.
- **Primary button hover** — `background: var(--brass-2); transform: translateY(-1px);` over 0.2s ease.
- **Ghost button hover** — border-color + text color → `--brass`.
- **Nav link hover** — color `--fg-soft` → `--fg`.
- **Offer row hover** — soft warm horizontal gradient background bloom; the circular "Mehr" icon fills with `--brass` and the arrow flips to `--ink-900`.
- **Portrait hover** — filter bumps (contrast + sepia up) and image scales 1.015 over 0.8s.
- **Availability pulse dot** — infinite `@keyframes pulse` every 2.2s, shadow ring expands 0→10px, fades out.
- **Smooth scroll** — all in-page `#angebote`, `#ueber`, `#termin` anchors should use smooth-scroll (already set via `html { scroll-behavior: smooth }` in global.css).
- **Focus states** — keep the existing `:focus-visible { outline: 3px solid var(--brass); outline-offset: 2px }` rule from `global.css`.
- **Accessibility** — every decorative layer (halos, grain, silhouette leftovers, dots) should carry `aria-hidden="true"`. Section headings are real h2/h3/h4s; the portrait uses `role="img"` with descriptive `aria-label`.

## State Management
Homepage is a **static Astro page**, no client state beyond:
- The existing `ChatWidget`, `CookieConsent`, `Navigation` (mobile menu), and CalDAV slot widget — reuse as-is.
- Data sourced via the existing helpers: `getEffectiveHomepage()`, `getEffectiveServices()`, `getEffectiveFaq()`, `getAvailableSlots()` — the redesign does not change data shape, only presentation.

## Design Tokens

### Colors (OKLCH + hex fallbacks)
| Token | Value | Usage |
|---|---|---|
| `--ink-900` | `#0b111c` | page base |
| `--ink-850` | `#101826` | elevated (footer, why section) |
| `--ink-800` | `#17202e` | panel (quote card) |
| `--ink-750` | `#1d2736` | subtle alternate |
| `--line` | `rgba(255,255,255,0.07)` | hairlines, dividers |
| `--line-2` | `rgba(255,255,255,0.12)` | stronger borders |
| `--fg` | `#eef1f3` | primary text |
| `--fg-soft` | `#cdd3d9` | body copy, ledes |
| `--mute` | `#8c96a3` | captions, meta |
| `--mute-2` | `#6a727e` | deep meta (footer bottom) |
| `--brass` | `oklch(0.80 0.09 75)` | primary accent, CTAs |
| `--brass-2` | `oklch(0.86 0.09 75)` | hover/italic accent |
| `--brass-d` | `oklch(0.80 0.09 75 / .14)` | tinted fills |
| `--sage` | `oklch(0.80 0.06 160)` | calm secondary accent (pulses, meta) |

These should replace the current tokens in `src/styles/global.css` under the `@theme` block, and be exposed to Tailwind as `bg-ink-900`, `text-fg`, `text-brass`, etc.

### Typography
- **Serif (display):** `Newsreader` — weights 300, 400, 500, 600; italic 400. Google Fonts. Used for H1, H2, H3 (offer titles), stat numbers, quote, portrait caption name, footer brand mark.
- **Sans (UI/body):** `Geist` — weights 300, 400, 500, 600, 700. Google Fonts.
- **Mono (meta):** `Geist Mono` — weights 400, 500. Used for eyebrows, kickers, numbers, caps labels, captions.

### Typography scale
| Role | Family | Size | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| H1 | Newsreader | `clamp(44px, 6.2vw, 88px)` | 300–350 | 1.02 | −0.02em |
| H2 | Newsreader | `clamp(32px, 3.6vw, 48px)` | 400 | 1.1 | −0.02em |
| H3 (sans) | Geist | 22px | 500 | 1.25 | −0.01em |
| H3 (offer) | Newsreader | 28px | 400 | 1.1 | −0.015em |
| Lede | Geist | 20px | 400 | 1.55 | — |
| Body | Geist | 15–16px | 400 | 1.55–1.6 | −0.005em |
| Eyebrow | Geist Mono | 11px | 500 | — | 0.18em, caps |
| Kicker | Geist Mono | 11px | 400 | — | 0.14em, caps |
| Stat number | Newsreader | 44px | 400 | 1 | −0.02em |
| Button | Geist | 14px | 600 | — | — |

### Spacing
Section padding: 120px / 80px (mobile). Section head margin-bottom: 72px / 48px. Card padding: 44px. Row padding: 36px. Small utility gap: 14/18/22px.

### Radii
- Frames & large cards: `22px` (`--radius`).
- Portrait frame: `4px`.
- Brand mark: `8px`.
- Pills / buttons / tags: `999px`.

### Shadows
- Portrait: `0 40px 80px -30px rgba(0,0,0,.75), 0 2px 0 0 rgba(255,255,255,.04), inset 0 0 0 1px var(--line-2)`.
- Otherwise, shadows are avoided — the design relies on hairlines, halos, and backdrop-blur instead.

### Atmosphere
- **Film grain:** fixed full-viewport SVG fractalNoise, `opacity .55, mix-blend-mode overlay`. Serve as a static SVG or inline data URI in the stylesheet.
- **Bg halo:** two radial blobs per hero — warm brass top-right, cool ink bottom-left.

## Assets
- `assets/gerald.jpg` — provided portrait of Gerald Korczewski (B&W, 1365×2048). Present it with the duotone wash + warm halo described above. In the Astro codebase, place under `public/gerald.jpg` (as referenced by `homepage.avatarSrc` in `mentolder.ts`).
- **Icons:** inline SVG, 14×14, stroke 2. Only the right-arrow is used. Matches existing conventions — no icon library needed.

## Files
- `Homepage Redesign.html` — full-fidelity source of the redesign. All CSS is inline in `<style>` at the top; all markup is semantic.
- `assets/gerald.jpg` — portrait asset.

### Mapping to the existing codebase
| Design section | Existing file to refactor |
|---|---|
| Top bar | `src/components/Navigation.svelte` |
| Hero | `src/components/Hero.svelte` (swap tagline/kicker pattern to match mono kicker row; add portrait prop) |
| Stats + Availability | inline in `src/pages/index.astro` (stats) + existing `SlotWidget.astro` (reskin to match slot pill style) |
| Offers | replace `src/components/ServiceCard.svelte` with a new `ServiceRow.svelte` |
| Why me + Quote | inline in `src/pages/index.astro` — extract a `WhyMe.svelte` + `QuoteCard.svelte` |
| Process | new `Process.astro` — not in current site |
| CTA | `src/components/CallToAction.svelte` — restyle per section 6 |
| Footer | `src/layouts/Layout.astro` footer block |
| Tokens | `src/styles/global.css` `@theme` block |

### Shared-system note (both brands)
The design is intentionally brand-agnostic. For `korczewski.de`:
- Swap copy via `korczewski.ts` (already structured the same way).
- `avatarType: 'initials'` path still works — use the same brass-gradient circle pattern as the portrait's caption avatar, scaled up to 260×260px in place of the photo frame.
- Stats and eyebrows read from the same fields; no structural changes needed.
