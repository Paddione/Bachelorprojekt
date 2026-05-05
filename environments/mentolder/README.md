# Mentolder Design System

> Editorial, calm, dark-navy + brass system for a 65-year-old digital coach and leadership mentor.

## About Mentolder

**Gerald Korczewski** runs **Mentolder** — a one-person practice in **Lüneburg, DE** offering:

1. **50+ digital** — patient 1:1 digital coaching for the over-50 generation (smartphones, banking, WhatsApp, video calls). From 60 €/h.
2. **Führungskräfte-Coaching** — career sparring for senior executives (positioning, headhunter prep, negotiation). 150 €/session (90 min).
3. **Unternehmensberatung** — digital transformation for SMBs, public administration, and critical infrastructure. By arrangement, 3–12 months.

The voice: **30+ years in Polizei Hamburg leadership**, KI-pioneer (first German police authority with face-recognition / BOS-Digitalfunk), now systemic coach. Generation 50+ himself. Tagline: *"Menschen, Prozesse und Technik wieder verbinden."*

There is a **sibling brand**, `korczewski.de`, which shares this exact system — only copy + brand config differ.

---

## Sources used to build this system

- `uploads/Homepage Redesign.html` + `uploads/README.md` — full hi-fi homepage prototype + design handoff (the canonical visual reference).
- `uploads/gerald.jpg` — provided portrait (B&W, 1365×2048).
- GitHub: **Paddione/Bachelorprojekt** (`main`) — the production Astro + Svelte codebase.
  - `website/src/styles/global.css` — token source of truth (mirrored here).
  - `website/src/config/brands/mentolder.ts` — copy, services, FAQ, milestones.
  - `website/src/components/*.svelte` — Hero, Portrait, ServiceRow, QuoteCard, WhyMe, ContactForm, NewsletterSignup, Navigation.
  - `website/src/components/admin/CreateInvoiceModal.svelte`, `QuestionnaireTemplateEditor.svelte`, `NewsletterAdmin.svelte`, `DokumentEditor.svelte` — admin patterns.
  - `website/src/lib/invoice-pdf.ts` — the warm-paper PDF renderer (font, palette, layout).
- `website/public/favicon.svg`, `website/public/gerald.webp`, `website/src/assets/icon-128.png` — copied to `assets/`.

The reader is **not assumed** to have access to those URLs/repos — everything required is mirrored locally.

---

## Index — what's in this folder

```
README.md                       this file
SKILL.md                        agent-skill manifest
colors_and_type.css             single source of CSS tokens (colors, type, radii, spacing, motion)
fonts/                          (Newsreader, Geist, Geist Mono are loaded from Google Fonts CDN — see colors_and_type.css)
assets/
  gerald.jpg                    portrait (1365×2048, B&W)
  gerald.webp                   web-optimized portrait
  favicon.svg                   brand mark glyph (m on dark)
  icon-128.png                  raster brand mark for PDFs

preview/                        Design System tab cards (registered assets)
  brand-mark.html               the m. wordmark + glyph
  palette-ink.html              ink-900 → ink-750 dark layers
  palette-brass.html            brass / brass-2 / brass-d / sage accents
  palette-text.html             fg / fg-soft / mute / mute-2
  palette-paper.html            warm paper palette (invoices, print)
  type-display.html             Newsreader display (h1/h2/h3 serif)
  type-body.html                Geist body + lede + small
  type-mono.html                Geist Mono eyebrow / kicker / stat
  spacing.html                  4-120 spacing scale
  radii.html                    radius scale (4 → 22 → pill)
  shadows.html                  portrait shadow + hairline elevation
  buttons.html                  primary pill / ghost pill / slot pill
  fields.html                   inputs / selects / textareas
  badges.html                   eyebrows / tags / status pills / pulse dot
  stat-cell.html                stat cell pattern
  service-row.html              offer-row pattern
  quote-card.html               editorial quote card
  portrait.html                 portrait component
  process-step.html             process rail step

ui_kits/
  website/                      marketing site (homepage, leistungen, kontakt, etc.)
    index.html                  click-thru prototype
    README.md
    *.jsx                       extracted components

document_kits/
  invoice/                      A4 Rechnung — warm paper, brass divider, mono table
    index.html
    README.md
  contract/                     A4 Vertrag — service contract, signatures, sections
    index.html
    README.md
  questionnaire/                Fragebogen (intake form) — multi-section, dark
    index.html
    README.md
  newsletter/                   HTML email newsletter — dark editorial
    index.html
    README.md
```

---

## Content fundamentals

Mentolder addresses **Generation 50+** and **senior executives** in Germany. The voice is **direct, calm, formal, warm**.

- **Sie-form** throughout. Always. Never du. ("Ich begleite Sie." — never "Ich begleite dich.")
- **First-person singular ("ich")** — Gerald is one person, not a team. ("Ich kenne beide Welten.")
- **Sentence case for body, sentence case for buttons** — German conventions. "Kostenloses Erstgespräch", not "KOSTENLOSES ERSTGESPRÄCH". Eyebrows / kickers / footer micro-labels are uppercase via CSS, not in the source string.
- **No emoji in marketing copy.** Emoji appear only inside the admin CMS as service-category icons (💻 🎯 🏢) — never on the marketing surface. The brand mark / portrait halo / brass dot do that work.
- **No exclamation marks** outside of FAQ answers. The tone is composed, not eager.
- **Three-beat rhythm** is a recurring trope — three short sentences, often three words each, often as a tagline closer:
  - *"Praxisnah. Strukturiert. Auf Augenhöhe."*
  - *"Kein Verkaufsgespräch. Kein Druck. Nur Klarheit."*
  - *"Pionier, nicht Nachahmer."*
- **"Auf Augenhöhe"** ("at eye level"), **"Klarheit"**, **"Begleitung"**, **"Haltung"** are recurring values vocabulary — re-use them rather than synonyms.
- **Italic accents** on a key phrase inside a serif headline — usually 2–3 words, in `--brass-2`. Hand-pick the phrase that carries the meaning:
  - *Menschen, Prozesse und Technik* `<em>wieder verbinden.</em>`
  - *In 30 Minuten wissen wir,* `<em>ob es passt.</em>`
- **Numbers wear small accents.** "30+", "50+", "KI" — the trailing `+` or the special token is wrapped in `<em>` and rendered in brass, non-italic. The serif treats the number with restraint.
- **Mono labels** above editorial blocks read like an editor's notation: `01 — Erstgespräch`, `GK · 01`, `Anno 2026 · Lüneburg`, `Lüneburg · DE`, `Netto gem. §19 UStG`. Em-dash, middle-dot, or space-en-dash-space — never an ASCII hyphen between concepts.
- **Don't sell.** Promise less, deliver clarity. The CTA copy ("Termin vorschlagen", "Kostenloses Erstgespräch") is invitational, not urgent. Avoid "Jetzt!", "Sofort!", "Nur heute!".

### Specific copy patterns

| Surface | Pattern | Example |
|---|---|---|
| Eyebrow | `mono caps · brass · 22px bar prefix` | `Meine Angebote` |
| Kicker  | `mono caps · mute` | `Digital Coaching · Führungskräfte-Beratung` |
| H1 with italic accent | one statement, italic phrase last | `Menschen, Prozesse und Technik *wieder verbinden.*` |
| Stat | big serif number + caps mono label | `30+ · Jahre Führung` |
| Process step | `01 — Erstgespräch` then bold sans h4 then mute body | see `preview/process-step.html` |
| Button | direct verb + arrow | `Kostenloses Erstgespräch →` |
| Footer micro | mono caps mute-2 | `© 2026 Mentolder — Alle Rechte vorbehalten` |
| Address / contact | mono mute, en-dash separator | `Lüneburg · DE` |

---

## Visual foundations

**Vibe:** editorial calm. Think *Monocle* + *Apartamento* dark mode. Quiet authority. **Hairlines, halos, type, and one warm accent** carry everything — not gradients, not shadows.

### Color
- Page is **`--ink-900` (#0b111c)**, a warm-leaning deep navy. Elevated surfaces step up to **`--ink-850`** (footer, "why" section) and **`--ink-800`** (quote card, panels).
- The single saturated accent is **`--brass`** (`oklch(0.80 0.09 75)`) — a warm amber that replaces what could have been "gold". Brass is used for **CTAs, eyebrows, italic accent words, hairline highlights, dot accents, hover borders**. Hover state is **`--brass-2`** (slightly lighter).
- A second, much quieter accent is **`--sage`** (`oklch(0.80 0.06 160)`) — used **only** for: the availability pulse dot, the small meta dot in the kicker row, and the secondary-meta sage label under offer titles ("Einzeln · Gruppe · Pakete"). Sage is *not* a generic-purpose color.
- Text rolls down from **`--fg` #eef1f3** (warm off-white, primary) → **`--fg-soft` #cdd3d9** (body) → **`--mute` #8c96a3** (captions) → **`--mute-2` #6a727e` (footer bottom).
- For **invoices, contracts, and printed material**, the system swaps to a **warm-paper palette**: `--paper #f6f3ee`, `--paper-2 #efeae1`, `--paper-ink #1a2030`, with the same **brass** as the only accent. Same brand, different substrate.

### Typography
- **Newsreader** (serif, weights 300/400/500/600 + italic 400) — display, h1, h2, editorial h3, stat numbers, quote, portrait caption name, large pricing figure.
- **Geist** (sans, 300–700) — UI, body, ledes, button labels, form fields, h3 sans variant.
- **Geist Mono** (400/500) — eyebrows, kickers, stat labels, captions, slot pills, footer micros, table column headers in invoices.
- The **wordmark** is Newsreader 18–20px italic + a brass period: `mentolder.` — never replaced with a logotype.

### Backgrounds, atmosphere
- The page has a **fixed full-viewport SVG film grain** (fractalNoise baseFrequency=0.9, opacity=0.55, mix-blend-mode=overlay). Subtle but always present — it warms the dark surface and prevents OLED flatness.
- The hero (and sometimes the CTA) carries **two atmospheric radial halos** behind the content: a warm brass halo top-right + a cool ink-blue halo bottom-left. Filter blur ~10–18px, opacity .11–.45.
- The portrait gets its **own pair of halos** (closer in, more intense) — read `preview/portrait.html` for the spec.
- **No images of stock photography or generic illustrations.** The only image is **Gerald**.
- **No repeating patterns or textures** other than the grain.

### Animation & motion
- **Slow, never bouncy.** Easing is `cubic-bezier(.22,.61,.36,1)` (`--ease-soft`) for almost everything. Durations: hover transitions **200ms**; portrait hover **800ms**; pulse dot **2.2s infinite**.
- **No spring physics, no large transforms, no scale-from-0 entrances.** The only persistent motion is the **availability pulse dot** (sage box-shadow ring expanding 0→10px and fading).
- **Portrait** has a multi-property hover: filter (contrast/sepia bump) + scale 1.015 over 0.8s.
- **Buttons** lift `-1px` on hover (`translateY(-1px)`).
- **Offer rows** get a soft horizontal warm bloom on hover (`linear-gradient(to right, transparent, rgba(232,200,112,.03), transparent)`) — never a hard background change.

### Hover, press, focus
- **Primary button:** bg → `--brass-2`, lift -1px.
- **Ghost button:** border + text → `--brass`.
- **Nav link:** color `--fg-soft` → `--fg`. Active link is `--brass`.
- **Slot pill:** border + text → `--brass`.
- **Offer row:** background warm bloom + the circular "Mehr" icon fills with brass and arrow flips to ink-900.
- **Press state:** no hard scale-down. Active button momentarily drops the `translateY(-1px)`. Avoid `transform: scale(.98)` — it feels mobile-app and clashes with the editorial calm.
- **Focus:** **`outline: 3px solid var(--brass); outline-offset: 2px`** — set globally on `:focus-visible`. Don't override per-component.

### Borders, dividers, hairlines
- **Hairlines do the heavy lifting.** Section boundaries, offer-row separators, footer divider, stat-cell dividers, portrait caption rule — all are `1px solid var(--line)` (`rgba(255,255,255,0.07)`) or the slightly stronger `var(--line-2)` (`rgba(255,255,255,0.12)`).
- **Brass hairlines** appear at moments of emphasis: above the portrait image, above the totals row in invoices, the rail line of the process-strip (gradient brass-fade), the kicker bar (22×1px solid brass).
- **No double borders, no thick borders.** If you want emphasis, use a brass hairline, not a 2px line.

### Shadows
- Used **almost nowhere** on dark surfaces. The portrait is the deliberate exception:
  ```
  0 40px 80px -30px rgba(0,0,0,.75),
  0 2px 0 0 rgba(255,255,255,.04),
  inset 0 0 0 1px var(--line-2);
  ```
  → big soft drop, hairline highlight on top edge, hairline border via inset.
- For elevated panels (quote card), the depth is a **radial brass glow inside the card** + a 1px line — never a box-shadow.

### Transparency & blur
- The **sticky top bar** is a translucent dark gradient + `backdrop-filter: blur(14px) saturate(1.1)`. This is the *only* surface using backdrop-blur in marketing.
- The portrait tag plate uses `rgba(11,17,28,.55) + blur(6px)`.
- Don't apply blur to text.

### Corner radii
- **22px** for large cards, the quote card, the framed portrait wrapper. Defined as `--radius`.
- **12px** for fields, smaller content cards.
- **8px** for the brand-mark glyph.
- **4px** for the portrait frame itself (intentionally crisp under the soft halos).
- **999px** for buttons, slot pills, tag plates, the brand-mark dot.

### Layout rules
- **Max-width 1240px**, gutter 40px (22px on mobile).
- **Section padding 120px / 80px (mobile)**. Section head margin-bottom 72px / 48px.
- **Two-column editorial grids** are the default — `1.15fr .85fr` for hero, `1fr 1.2fr` for section heads, `1fr 1fr` for "why me", `1fr 2.5fr` for the process strip.
- The offer-row is a **5-column horizontal grid**: `80px 1fr 1.6fr 220px 140px`. It collapses to 3 columns under 1000px.

### Imagery
- Portraiture is **B&W source + warm duotone wash + brass top-edge hairline**. The CSS `filter: contrast(1.04) brightness(1.02) sepia(.18) saturate(1.05)` warms a B&W into the brass world without becoming a Lomo filter.

### Don'ts
- ❌ No purple-blue gradients.
- ❌ No emoji on marketing surfaces.
- ❌ No left-border-only colored cards.
- ❌ No stroke icons larger than 14×14 (the right-arrow is the only marketing icon — see Iconography).
- ❌ No drop-shadows on cards. Use hairlines.
- ❌ No `text-align: justify`.
- ❌ No text larger than 88px.

---

## Iconography

The marketing site is **almost icon-free**.

- The **only** icon used in marketing is the **right-arrow** (`→`), inline 14×14 SVG, stroke-width 2:
  ```html
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
  ```
- No icon library is used or needed on the marketing surface. Heroicons is loaded only inside the admin app for action buttons (and in the `whyMePoints` data shape — see `mentolder.ts`'s `iconPath` field — which is only used by `WhyMe.svelte` for three small inline SVG paths).
- **Emoji** appears in the **admin CMS only**, as service-category icons (💻 🎯 🏢) inside the `services[].icon` and `leistungen[].icon` config fields. Never on the public marketing surface.
- The **brand mark** is a custom shape — a 30×30 (or 28×28 in footer) **rounded square with a radial brass gradient and an "M" silhouette carved out via clip-path**. See `preview/brand-mark.html` for the exact CSS. The `assets/icon-128.png` is the raster fallback used in the invoice PDF; `assets/favicon.svg` is the favicon (a serif "m" in brass on dark).
- **Unicode separators** used as iconography: `·` (middle dot, U+00B7), `—` (em-dash, U+2014), `→` (rightwards arrow, U+2192). These are never replaced with images. Examples: `Lüneburg · DE`, `01 — Erstgespräch`, `→ alle Termine`.
- **Bullets** in feature lists are **4×4 brass dots** rendered via `::before` — translateY(-3px) to baseline-align with the line height. Never `•` U+2022, never `–`, never an icon.

If a future surface needs additional icons (admin / dashboard), use **Heroicons outline 24×24, stroke-1.5** at small sizes (`w-4 h-4`) — that's what the existing admin Svelte components already do (`AdminShortcuts.svelte`, `Navigation.svelte` mobile menu hamburger).

---

## Quick start (for an agent or designer)

1. Link `colors_and_type.css` first — every other file assumes its tokens.
2. Load fonts via the `@import` already inside `colors_and_type.css` (Google Fonts CDN).
3. For dark marketing surfaces, set `body { background: var(--ink-900); color: var(--fg); }` and let the inherited tokens cascade.
4. For paper/print/invoice surfaces, use the `--paper-*` tokens — see `document_kits/invoice/`.
5. Reach for the patterns in `preview/` before inventing new components.
6. The **only** brand mark is the radial-brass-square — don't draw a new logotype. Use `assets/icon-128.png` for raster, the inline CSS pattern for live HTML, `assets/favicon.svg` for browser favicon.

---

## Caveats (please review)

- **Fonts are loaded from Google Fonts CDN** — there are no `.ttf`/`.woff` files in `fonts/` because the production codebase also relies on the CDN. If you need offline weights, please drop them in `fonts/`.
- The website UI kit is built from the **uploaded HTML redesign** (the canonical hi-fi reference) cross-checked against the production Svelte components. Where the prototype and the codebase disagreed, the prototype won — it's the newer artifact.
- The **invoice, contract, questionnaire, and newsletter** kits are derived from `invoice-pdf.ts` (real renderer) and the admin Svelte editors (real form structure), then translated into static HTML using the same tokens. No real PDF/email rendering is performed in the kit — these are pixel previews.
- Sibling brand `korczewski.de` shares this exact system. Swap `assets/gerald.*` and the copy in `mentolder.ts` for `korczewski.ts` to retarget.
