# Korczewski Visual Design Brief

**Companion to:** `docs/superpowers/specs/2026-05-09-korczewski-as-mentolder-template-design.md`
**Live mockup:** open `mockup.html` in any browser
**Live site (current):** https://web.korczewski.de/

## How to read the mockup

Each dashed lime box in `mockup.html` is an **asset slot** with an ID like `A2`, `A4a`, `A6c`. Match the ID to the table below to get the spec for that slot. Real text/copy in the mockup is final; only the dashed boxes need new art.

## Palette and typography (use these exactly)

| Token | Hex | Usage |
|---|---|---|
| `--ink-900` | `#120D1C` | Page background |
| `--ink-850` | `#1A1326` | Section background (alt rows) |
| `--ink-700` | `#3A2E52` | Borders, dividers |
| `--lime` (`--copper`) | `#C8F76A` | Primary accent — strokes, CTAs, headlines |
| `--teal` (`--cyan`) | `#5BD4D0` | Secondary accent — meta labels, eyebrow text |
| `--fg` | `#EFE9F4` | Body text |
| `--fg-mute` | `#948AA0` | Secondary text |
| Serif (display) | Instrument Serif | Headlines, pull quotes, italics |
| Sans (body/UI) | Geist (300–700) | Body copy, navigation, buttons |
| Mono (labels) | JetBrains Mono | Section labels, eyebrow text, code |

**Mood brief for every asset:** *Senior engineer's lab notebook. Calm. Confident. Geometric. Restrained. No gradients. No glow. No glassmorphism. No neon. No silicon-valley cliché. Line weight thin and decisive (~1.5px).*

---

## Asset shopping list

Priority key: **P0** = site looks broken without it · **P1** = site feels generic without it · **P2** = polish.

### P0 — Must have (site has visible holes today)

#### A2 — Identity image
- **Slot:** Hero portrait (right column)
- **File:** `website/public/brand/korczewski/identity.webp` (currently `identity.svg` placeholder = K monogram in circle)
- **Format:** WebP, ~600×800, sRGB, ≤120 KB
- **Style:** ¾ profile photo OR stylized geometric portrait. Dark backdrop matching `--ink-900`. Warm key light from upper-left. Brass/lime rim light optional. Square crop must also work for OG fallbacks.
- **Acceptance:** Recognizable at 160px wide on mobile. No corporate-headshot blandness — should look like the person actually engineers things.

#### A4a–A4c — Service line icons (3 used today, 7 in sprite for future)
- **Slot:** Service cards (3 cards on korczewski; sprite holds 7 for cross-brand reuse)
- **File:** `website/public/brand/korczewski/icons.svg` (sprite exists; icons need designer pass)
- **Format:** Single SVG sprite, each `<symbol>` `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="1.5"`, round caps + joins, no fills
- **Symbol IDs (must match exactly — hard-coded in BrandConfig):**
  - `icon-ki-beratung` — currently weak: chip-with-dots reads as "smart chip" but doesn't differentiate from `icon-ki-transition`. Suggest: brain hemisphere with circuit traces.
  - `icon-software-dev` — current `</>` is fine; could be elevated.
  - `icon-deployment` — currently weak: isometric cube crowds at 16px. Suggest: stacked tiles + chevron, OR cargo-container silhouette.
  - `icon-50plus-digital` — phone with signal ripples (already acceptable, included for future use)
  - `icon-coaching` — two figures + dialog dots (acceptable)
  - `icon-beratung` — org-chart node tree (acceptable)
  - `icon-ki-transition` — sprout breaking from circuit (acceptable)
- **Acceptance:** All seven legible at 16px. Visual cohesion as a set (consistent stroke weight, geometric language). Each must clearly differentiate from the others.

#### A1 — Favicon / wordmark mark
- **Slot:** Browser tab, footer logo, header logo
- **Files:**
  - `website/public/brand/korczewski/favicon.svg` (exists — brass K on dark, acceptable)
  - `website/public/brand/korczewski/favicon-32.png`, `apple-touch-icon.png` (180×180), `favicon-512.png` (PWA)
- **Format:** SVG master, viewBox 64×64. PNG exports for legacy browsers and PWA.
- **Style:** Brass K monogram on `--ink-900` rounded square (8% radius). Or: a 1-glyph security-themed mark. Must read at 16×16.
- **Acceptance:** Recognizable in a stack of 30 favicon tabs. Distinct from mentolder's mark.

#### OG / social share card
- **Slot:** Link previews (Slack, WhatsApp, Twitter, LinkedIn)
- **File:** `website/public/brand/korczewski/og-card.png` (exists — copied from existing `og-image.png`, 1200×630)
- **Format:** PNG, 1200×630, ≤200 KB
- **Style:** Wordmark "korczewski.de" in Instrument Serif (large, brass). Tagline "Software Engineering & IT-Security-Beratung" in Geist below. Decorative kore-dark backdrop with subtle topology lines or fine grain. Brass hairline accent.
- **Acceptance:** Tagline readable in WhatsApp preview at thumbnail size. No text smaller than 32px in the source.

---

### P1 — Strong to have (raises perceived production quality)

#### A3a–A3d — Stat watermarks (4)
- **Slot:** Behind each stat number in the credentials band
- **File:** `website/public/brand/korczewski/stats/{security,experience,ai,k8s}.svg`
- **Format:** SVG, viewBox 200×120, monochrome at very low opacity (~25%)
- **Style:** Subtle decorative motif behind each stat. Examples: shield grid behind "B.Sc. IT-Sicherheit"; clock-and-arrow behind "10+ Jahre"; circuit-mesh behind "KI"; node-graph behind "K8s".
- **Acceptance:** Visible but never competes with the foreground number. Could be omitted entirely without breaking the layout.

#### A5a–A5c — WhyMe point badges (3)
- **Slot:** Circular badge next to each WhyMe point
- **File:** Reuse `icons.svg` symbols, OR add `whyme-{security,ai,delivery}` to the same sprite
- **Format:** SVG symbols, same conventions as A4
- **Style:** Pictograms — shield (security first), wand-and-spark (KI als Werkzeug), arrow-loop (Konzept→Cluster). 56×56 circle backdrop in lime stroke.
- **Acceptance:** Distinct from service icons. Recognizable on first glance.

#### A7 — Quote backdrop texture
- **Slot:** Behind the pull quote ("Gute Systeme entstehen nicht durch Tools allein…")
- **File:** `website/public/brand/korczewski/quote-texture.svg` (or .webp)
- **Format:** SVG (preferred — scales) or 2400×1200 WebP, ≤80 KB
- **Style:** Sage-tinted noise OR fine topographic line pattern (think USGS contour map at 5% opacity). Full-bleed, repeats horizontally.
- **Acceptance:** Adds tactile depth without distracting from the quote. Test: cover the quote text with your hand — the texture should still feel calm, not busy.

---

### P2 — Polish (nice to have, ship without)

#### A6a–A6d — Process step illustrations (4)
- **Slot:** Above each of the four process steps
- **File:** `website/public/brand/korczewski/process/{01-erstgespraech,02-klarheit,03-begleitung,04-uebergabe}.svg`
- **Format:** SVG, viewBox 320×240, line-art only
- **Style:** Small isometric or line vignettes. Erstgespräch = two chairs at a table; Klarheit = a path branching with one fork chosen; Begleitung = a node moving along a track; Übergabe = a key being handed across.
- **Acceptance:** All four feel like one set. Optional — pure typography also works for kore aesthetic.

#### Email signature banner
- **Slot:** Email signature below sign-off
- **File:** `website/public/brand/korczewski/email-signature.png`
- **Format:** PNG, 600×120, ≤50 KB
- **Style:** Same source as OG card, different crop. Wordmark + role + URL.

#### 404 / status illustration
- **Slot:** `/404` page
- **File:** `website/public/brand/korczewski/404.svg`
- **Style:** Playful tech humor that fits the audience — broken cluster node, severed wireguard tunnel, terminated pod with grave marker. Keep palette tight.

---

## What you can hand to a designer in one go

If commissioning external work, the **fastest punch above weight** is this bundle:

1. **Identity image (A2)** — one good portrait shifts the entire site's perceived quality.
2. **Service icon sprite (A4)** — replace the seven inline SVGs with a coherent set; deliver as `icons.svg` with the exact symbol IDs above.
3. **OG card (A6 / OG section)** — link previews are how the site introduces itself to people who haven't visited yet.

Three deliverables, ~1–2 designer days, pays for itself the first time someone shares the URL.

## Reference

- Live site: https://web.korczewski.de/
- Mentolder for visual comparison: https://web.mentolder.de/
- Existing assets to inspect: `website/public/brand/korczewski/`
- BrandConfig (where slots are wired): `website/src/config/brands/korczewski.ts`
- CSS tokens: `website/public/brand/korczewski/colors_and_type.css`
