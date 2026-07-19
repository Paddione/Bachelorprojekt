# Plan: Fix T001950 — Lighthouse Performance 74→≥90

## Context
Score at 74/100. Previous PRs #2899/#2902/#2903 raised from 60→74. Remaining levers: Google Fonts self-hosting, sidekick-panels.css out of critical path, ~80 KB unused JS.

## Tasks

1. **Self-host Google Fonts**
   - Download Inter/font-display fonts used by the website
   - Place in `website/public/fonts/` 
   - Replace Google Fonts `<link>` with local `@font-face` declarations
   - Update CSS to use `font-display: swap`
   - Eliminates external DNS lookup + render-blocking request

2. **Move `sidekick-panels.css` out of critical path**
   - Change `<link rel="stylesheet">` to `<link rel="preload" as="style" onload="this.rel='stylesheet'">`
   - Or: inline critical CSS, defer the rest
   - Reduces FCP/LCP by unblocking render

3. **Remove unused JS (~80 KB)**
   - Run `npx source-map-explorer` or `next build` analysis
   - Identify dead code paths (likely from unused Svelte components or legacy scripts)
   - Tree-shake or dynamic-import to split

4. **Verify Core Web Vitals**
   - Run `npx @lhci/cli autorun` locally
   - Check FCP, LCP, CLS, TTI against budgets in `lighthouse-budget.json`

5. **Update goals.md baseline**
   - Set G-FE05 to measured score (target ≥90)
   - Add Baseline-Update entry

## Verify
- `npx @lhci/cli autorun` reports score ≥90
- `bash scripts/health-goals-check.sh --only=G-FE05` shows target reached
