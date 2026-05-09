---
title: Korczewski Site Rebuild: One Template, Two Themes
domains: [website]
status: active
pr_number: null
---

# Korczewski Site Rebuild: One Template, Two Themes

**Status:** approved
**Date:** 2026-05-09
**Domains:** website
**Owner:** patrick

## Problem

`web.korczewski.de` is a parallel implementation of mentolder using a separate component set (`website/src/components/kore/`). The result is structurally thinner than mentolder despite carrying ~75% as much content data (`korczewski.ts` is 319 lines vs mentolder.ts 422). The duplication has compounded: every new mentolder section requires a parallel Kore* implementation that often never lands.

## Decision

Retire the Kore* component set. Both brands render through the **same** mentolder-derived component set and differentiate purely through:

1. `website/src/config/brands/<brand>.ts` — content (BrandConfig)
2. `website/public/brand/<brand>/<brand>-website.css` — visual theme (CSS variable overrides)
3. `website/public/brand/<brand>/<brand>-app.css` — admin/portal theme

A new brand requires **only those three files** — never new components. This is the "template in the registry" pattern, expressed correctly: the template is the shared component set; the registry slot is the BrandConfig + theme tokens.

## Architecture

### Existing infrastructure to keep

- `Layout.astro` accepts a `brand` prop and conditionally injects per-brand CSS (`isKore` branch already does this).
- All visual styling already flows through CSS variables (`--ink-900`, `--brand-primary`, `--font-sans`, etc.).
- `kore-website.css` and `kore-app.css` already exist as the kore theme.
- `BrandConfig` type already drives content for stats, services, headlines, whyMe points, quote, etc.

### Code changes

| File | Change |
|---|---|
| `website/src/pages/index.astro` | Strip the `BRAND_ID === 'korczewski'` branch entirely. Single rendering path uses mentolder components for both brands. |
| `website/src/layouts/KoreLayout.astro` | Delete. Pages using it switch to `<Layout brand="korczewski-kore">`. |
| `website/src/components/kore/` | Delete the entire directory (13 components). |
| `website/src/components/Navigation.svelte` | Make brand-aware via `BrandConfig.navigation: {label, href}[]`. KoreSubNav links migrate into `korczewski.ts`. |
| `website/src/components/Footer.svelte` (new — extracted from KoreFooter logic) | Generic footer driven by `BrandConfig.footer`. |
| `website/src/config/types.ts` | Add `BrandConfig.homepage.timeline?: boolean` (drives the live PR feed section). Add `BrandConfig.navigation` and `BrandConfig.footer`. |
| `website/src/config/brands/korczewski.ts` | Set `homepage.timeline = true`, populate `navigation` and `footer` from current Kore* hardcodes. |
| `website/src/config/brands/mentolder.ts` | Populate `navigation` and `footer` from current Navigation.svelte hardcodes. |
| `website/src/styles/kore-website.css` | Audit pass — ensure CSS variable overrides theme the mentolder components correctly (they may target Kore* class names today). |
| Pages: `leistungen.astro`, `[service].astro`, `ueber-mich.astro`, `referenzen.astro`, `kontakt.astro` | Verify each is brand-neutral. Most already are. Fix any Kore* imports. |

### Visual asset slots (first-cut from this work, real art commissioned separately)

| Asset | Path | First-cut produced here |
|---|---|---|
| Service icons (7) | inline SVG sprite in `website/public/brand/korczewski/icons.svg` | Yes — line icons replacing emoji |
| Hero topology | existing `KoreTopology.svelte` | Polish only — already exists |
| OG / social card | `website/public/brand/korczewski/og-card.png` (generated from SVG) | Yes — wordmark + tagline on kore-dark |
| Favicons | `website/public/brand/korczewski/favicon.{svg,ico,png}` | Yes — K monogram, brass on dark |
| Portrait / identity image | `website/public/brand/korczewski/identity.webp` | Placeholder — user commissions real |
| Section dividers, process illustrations, pillar badges | — | Out of scope for this work |

## Out of scope

- Admin and portal layouts (already brand-neutral via `isKore` + CSS vars).
- Mentolder pages (zero changes).
- New copy authoring for korczewski (existing `korczewski.ts` content is sufficient; iterate later).
- Real art commissioning (placeholder/first-cut SVGs only).

## Acceptance criteria

1. `web.korczewski.de/` renders the mentolder homepage structure (Hero → Stats → Services → WhyMe → Process → SlotWidget → FAQ → CTA → Timeline) themed with kore CSS variables.
2. `web.korczewski.de/{leistungen, ueber-mich, referenzen, kontakt}` and `/{service-slug}` pages render correctly under kore theme.
3. `website/src/components/kore/` directory is deleted.
4. `website/src/layouts/KoreLayout.astro` is deleted.
5. `web.mentolder.de` is visually unchanged (regression check via E2E).
6. A new brand can be added by creating `<brand>.ts` + `<brand>-website.css` + `<brand>-app.css` only — verified by adding a documented procedure to CLAUDE.md or a brand-template README.
7. Service emoji replaced with line-icon SVG sprite for korczewski; mentolder retains emoji unless a separate icon set is provided.

## Risks

- **kore-website.css regressions:** the stylesheet may target Kore*-specific class names. Mitigation: visual diff via Playwright screenshot tests against the current site, fix any drift before deploy.
- **Hidden Kore* references:** other pages or components may import from `kore/`. Mitigation: grep for `from.*kore` before deletion.
- **Timeline coupling:** `KoreTimeline.svelte` consumes the `/api/timeline` endpoint. The replacement (a generic Timeline gated on `BrandConfig.homepage.timeline`) must preserve the same data contract.
