# DOCS-DESIGN-STANDARDS.md

Design standards for the generated docs site (`docs.{mentolder,korczewski}.de`),
built by `scripts/docs-gen/`. Parallel to `website/WEBSITE-STANDARDS.md`.

## Theme
- **Single neutral dark brand theme** for both domains. No per-domain runtime
  switch, no light/dark toggle, no two-image split.
- All colour comes from CSS custom properties in `theme.mjs` `editorialCss()`
  `:root`. Never hardcode hex outside `:root`.
- Accent = brass `#e8c870` (the sidekick FAB / house colour).
- Fonts: **Geist** (sans/body), **Instrument Serif** (headings), system mono for
  code. Loaded via a Google-Fonts `<link>` in `templates.mjs` `documentHead()`.

## Layout
- "Mid reskin": the editorial page-shell (column, card frame, breadcrumbs, TOC)
  stays. Only colour, type, and the branded header/footer changed.

## Mermaid / graph
- **Never re-render mermaid to recolour.** Snapshots are SHA-keyed and cached;
  recolour strictly via CSS variables on the SVG element selectors.

## Deploy
- `docs:sync` does **not** work (read-only container rootfs). Ship via
  `task docs:deploy` (rebuild image → rollout to `workspace` +
  `workspace-korczewski` on the fleet context via `FLEET_KUBECONFIG`).
