---
name: kore-design
description: Use this skill to generate well-branded interfaces and assets for Kore. (Kubernetes consultancy/tooling), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key files:
- `colors_and_type.css` — drop-in tokens (colors, type, spacing, radii, shadow, motion). Loads webfonts from Google Fonts.
- `styles/app.css` — app shell, buttons, pills, paper documents
- `styles/website.css` — marketing-page sections
- `assets/` — logos and a couple of infrastructure SVGs
- `ui_kits/website/` — interactive marketing-site recreation
- `ui_kits/app/` — in-product app shell recreation

Brand quick reference:
- **Aubergine ink** dark substrate (`#120D1C`), never pure black
- **Plasma lime** primary accent (`#C8F76A`) — CTAs, eyebrows, italic emphasis
- **Cyan** secondary (`#5BD4D0`) — health/live/paid only
- **Instrument Serif** for headlines and numerals; *italic* for emphasis
- **JetBrains Mono** ALL CAPS + tracked for labels/eyebrows/pills
- **Geist** for body
- Film grain over every dark surface
- No emoji; line icons only (Lucide as a stand-in)
- One ease, three durations: `cubic-bezier(.2,.7,.2,1)` at 120/200/320ms
