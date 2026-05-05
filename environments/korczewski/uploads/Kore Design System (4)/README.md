# Kore Design System

**Kore.** is a Kubernetes / infrastructure consultancy and tooling brand. The visual identity reads like a serious infrastructure product crossed with a boutique studio: aubergine-ink dark backgrounds, plasma-lime accents, an italic serif for warmth, and mono type for credibility. Film grain over everything keeps it from feeling like another sterile dev-tools site.

The system is deliberately small and opinionated — three colors that matter, three typefaces, and a strong rhythm of `mono · serif · sans` typesetting that should be honored on every screen.

## Sources

- **Codebase:** `korczewski-proto/` (read-only mounted folder, copied into this project)
  - `ds/colors_and_type.css` → tokens (copied to root as `colors_and_type.css`)
  - `app.css` → app shell, buttons, pills (`styles/app.css`)
  - `styles/website.css` → marketing-page sections (`styles/website.css`)
  - `assets/*.svg` → logos + a few infrastructure illustrations (`assets/`)
  - `tweaks-panel.jsx` → carries through (`ui_kits/tweaks-panel.jsx`)

The user described the codebase as "the homepage and all the menus" — i.e. the Kore marketing site plus an in-app shell. Both surfaces are reproduced here as UI kits.

## Index

- `colors_and_type.css` — design tokens (colors, type scales, spacing, radii, shadow, motion)
- `styles/app.css` — global app shell + buttons + pills + paper documents
- `styles/website.css` — marketing-page section styles
- `assets/` — logos (mark + dark/light lockups) and a couple of infra illustrations
- `fonts/` — none locally; the system uses Google Fonts (Instrument Serif, Geist, JetBrains Mono)
- `preview/` — design system cards rendered in the Design System tab
- `ui_kits/` — high-fidelity recreations
  - `ui_kits/website/` — the Kore.com marketing site (hero, services, cases, team, contact, footer)
  - `ui_kits/app/` — the Kore in-product app shell (clusters list, run detail, paper doc)
- `SKILL.md` — agent-skill manifest so this folder works as a portable skill

## Content fundamentals

**Voice.** Confident, technical, slightly literary. Not cute. Sentences are often short, with the occasional italicized noun for rhythm. Treats infrastructure work as craft, not magic.

**Casing.**
- Eyebrows, labels, pill text, footer columns, stat labels, kbd-style mono → **ALL CAPS** with `0.14–0.18em` letter-spacing, mono.
- Headlines and body → sentence case; never title case.
- Product / service names get *italicized serif* mid-sentence to highlight them, e.g. "we run *Cluster Adoption* in 2 weeks."

**Tense / pronouns.** First-person plural ("we") for the studio, second-person ("you") for the reader. Never "I."

**No emoji, anywhere.** Status uses small colored dots + uppercase mono words (`SYNC`, `OK`, `FAIL`). Where the UI needs an icon, it's a 1.5px stroke line glyph in `currentColor`.

**Numbers and units.** Numerals stay serif; units stay mono and muted: `<span class="v">2<span class="u">wk</span></span>`. Percentages and times follow the same pattern.

**Sample copy snippets.**
- Hero: "Kubernetes, *quietly run for you.*"
- Eyebrow: `[ 01 — SERVICES ]`, `[ NOW DEPLOYING ]`
- Case study lede: "Six-month engagement. Zero pages outside business hours."
- Empty state: "Nothing scheduled. Pick a slot above."

## Visual foundations

**Color.** Three families, used in fixed roles. **Aubergine ink** (`#120D1C` → `#3A2E52`) is the substrate — every dark surface is one of five graded ink tones, never pure black. **Plasma lime** (`#C8F76A`, `#D8FF8A`) is the only true accent — it carries primary CTAs, eyebrows, italic emphasis, focus rings, and lime-tinted radial glows in the corner of cases. **Cyan** (`#5BD4D0`) is the secondary, reserved for *paid / healthy / live* indicators (think: kubelet OK). A warm bone-paper (`#EDE6D8`) shows up only for printed documents (invoices, contracts) — it is never used as a panel background. There's also a single failure red (`#E26B6B`) and a muted info blue.

**Type.** Three families, used relentlessly:
- **Instrument Serif** for every headline and almost every numeric value (stats, prices, slot times). Italic serif for emphasis is the brand's signature move — see `em.kore` / `.em`.
- **Geist** for body, leads, button labels, links.
- **JetBrains Mono** for eyebrows, labels, pills, code, KBD chips, footer headers, ID strings, units. Always uppercase + tracked when used decoratively.

**Spacing.** 4px base, declared as `--s-1 … --s-32`. Marketing sections use `padding: 80px 28px` and a `1280px` max width. Stats and meta-rows use a `1px` top border + 24px gap.

**Background.** All dark surfaces sit on `--ink-900` with a body-level film grain (`feTurbulence` SVG, opacity .55, mix-blend `overlay`). Hero and case panels add a single radial-gradient glow tinted lime or cyan, top-right or bottom-left only. **Never** centered radials. **No** photographic backgrounds. **No** repeating texture other than the noise.

**Animation.** One ease everywhere: `cubic-bezier(.2,.7,.2,1)`. Three durations: `120ms` `200ms` `320ms`. The only repeating animation is `pulse` on live-status dots (1.4–1.6s). Scrolling, transforms, and fades all defer to that single cubic-bezier — no bounces, no overshoot.

**Hover / press.**
- **Hover:** borders move from `--line` to `--line-2` or all the way to `--copper`; shadow-2 fades in. CTAs get `--copper-2`. Links go from `--fg-soft` to `--fg`, or from `--fg-soft` to `--copper`.
- **Press:** `transform: translateY(1px)` + `--shadow-press`. No color flash, no scale.
- **Focus:** lime, never blue.

**Borders.** Hairlines are `rgba(255,255,255, .07 / .12 / .20)` — `--line` / `--line-2` / `--line-3`. On paper, `rgba(15,23,36,.10)`. Cards never get more than 1px. Stat cards use an `inset 0 1px 0 var(--copper)` lime-on-top inner-shadow as their *only* embellishment.

**Shadow.** Two outers (`--shadow-1`, `--shadow-2`) are deep and offset, never blurry-flat. The lime inner highlight `--inner-copper` (`inset 0 1px 0 rgba(255,255,255,.25)`) is what makes lime CTAs look pressed-into-paper.

**Transparency / blur.** `backdrop-filter: blur(14px)` only on the sticky shell-nav. Cards never blur their background. Lime / cyan tints (`rgba(*, .07–.18)`) appear as soft fills behind chips and inside service-tile glyphs.

**Corner radii.** Pills `999px`, tiles `22px`, cards `16px`, inputs `10px`, paper `4px`, chips `6px`. Never anything in between.

**Cards.** `background: var(--ink-850)`; `border: 1px solid var(--line)`; `border-radius: 16px`; `padding: 28–48px`. On hover, border lifts to `--line-2` and a `--shadow-2` appears. A subtle radial glow may sit inside, top-right, lime-tinted at 8% — no other decoration.

**Layout rules.** `max-width: 1280px` for marketing, `1440px` for the app shell. Section heads use a strict `[80px num] [1fr title] [auto hint]` grid with a hairline rule beneath. Hero meta-rows are `repeat(4, 1fr)` desktop, collapsing to `1fr 1fr` ≤980px.

## Iconography

Kore.com ships **almost no icons**. Where iconography appears it's hand-drawn 1.5px-stroke line work in `currentColor`, sized `56×56` inside a `--copper-tint` rounded square (the "service glyph"). Three SVGs live in the codebase:

- `assets/k8s-wheel.svg` — the Kubernetes helm — used for primary infra service tiles
- `assets/topology-3node.svg` — control-plane + 3 nodes — used as a small case-study illustration
- `assets/logo-mark.svg`, `assets/logo-lockup-dark.svg`, `assets/logo-lockup-light.svg` — the wordmark + the "Kore" mark (a stylized K rendered in lime gradient strokes)

**Emoji:** never used.
**Unicode glyphs as icons:** never. Status uses a 6–8px filled dot, sometimes with a `pulse` animation.
**Icon font / sprite:** none in the codebase.

For UI elements that need icons not present in the codebase (search, settings, arrow, chevron, copy, close, plus, minus, externalize-link), **substitute Lucide** (`lucide@latest`, 1.5px stroke, 24×24) — same hand-drawn-line style as the existing SVGs. This is a substitution; flagged here so the user can replace with custom marks later.

## Caveats / substitutions

- **Fonts:** no local font files were provided. The system loads **Instrument Serif**, **Geist**, and **JetBrains Mono** from Google Fonts. If the brand owns licensed copies, drop them into `fonts/` and replace the `@import` at the top of `colors_and_type.css`.
- **Icons:** no icon set in the source. Lucide is used in UI kits as a stand-in.
- **Photography / illustrations:** none provided. The portrait card on the team section uses a placeholder gradient + ID string. Cases, tickers, and stats use generated copy in the spirit of the brand.
- **Real product copy:** none provided. The lede / case-study / contact copy in the UI kits is written to match the voice rules above and is illustrative.
