---
name: kore-design
description: Use this skill to generate well-branded interfaces and assets for Kore. (the Kubernetes studio) and its game product Arena, either for production or throwaway prototypes / mocks / decks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# Kore. design skill

Read the README.md file within this skill, and explore the other available files. Specifically:

- `colors_and_type.css` — drop-in stylesheet with brand tokens, base type roles, surface helpers and the grain overlay. Most artifacts only need this.
- `fonts/` — Geist (UI), Instrument Serif (display), JetBrains Mono (mono) as woff2.
- `assets/` — favicons, OG image, topology SVG, Arena character sprites under `assets/arena/`.
- `ui_kits/arena/` — pixel-honest Arena game-client recreation (Home / Lobby / Game / Results / Character picker). Composable React components in `components.jsx` and `screens.jsx`. Include via `<script type="text/babel" src>`.
- `characters/` — reference for the "normal-people" cast mocks the user has been iterating on.
- `preview/` — small documentation cards demonstrating each foundation in isolation. Useful when you need a visual reminder of a token.

If creating visual artifacts (slides, mocks, throwaway prototypes, decks, character mocks):
1. Copy `colors_and_type.css` and the relevant `fonts/` woff2 files into your output project.
2. Copy any logos / OG / topology / Arena sprites you actually use into your output's `assets/` folder.
3. Use the brand voice — quiet, dry, infrastructural; sentence case; ALL-CAPS only for tracked-out mono eyebrows; the brandmark is always `Kore.` with the dot in `--lime`; no emoji.
4. Use the layout backbone for long-form: a 3-column section header `[ NN ] · serif headline · mono hint · 1px line rule`.
5. Static HTML files for the user to view; never inline screenshots of these assets.

If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design (deck, mock, character, marketing page, in-game screen, business card, slide, etc.), ask 3-5 questions about audience and tone, then act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Substitutions to flag to the user:
- Iconography uses **Lucide @ stroke 1.75** by default — the source codebase ships no vendored icon set. Confirm or substitute.
- Marketing UI primitives in `ui_kits/marketing/` (if present) are derived from the brand-assets HTML, not from a marketing codebase.
