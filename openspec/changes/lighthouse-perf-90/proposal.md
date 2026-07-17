# Proposal: lighthouse-perf-90

## Why

Die öffentliche Website (mentolder) erreicht nur **Lighthouse Performance 60/100**
(T001911-Baseline 2026-07-17: FCP 6,0 s, LCP 7,5 s, TTI 7,5 s — aber TBT 0 ms und CLS 0).
Das ist ein reines **Auslieferungsproblem**: keine Text-Kompression in der Traefik-Kette
(~622 KiB Verschwendung), das LCP-Hero-Bild lädt als 176-KB-JPEG mit `loading="lazy"`
obwohl ein 17-KB-WebP ungenutzt daneben liegt, Google Fonts werden doppelt geladen
(`<link>` + `@import`), und zwei nicht-kritische Islands hydratisieren `client:load`.
Core Web Vitals sind SEO-relevant (G-FE05-Ziel: Score ≥ 90).

## What

1. **E1 — Traefik-Middlewares** in `k3d/website.yaml`: `website-compress` (gzip/br am Edge)
   und `website-static-cache` (`Cache-Control: public, max-age=31536000, immutable` für
   `/_astro/`), an die Website-IngressRoute gebunden. Wirkt über die Kustomize-Base für
   **beide Brands**.
2. **E2 — LCP-Bild**: `avatarSrc` in `mentolder.ts` auf `/gerald.webp`; `Portrait.svelte`
   `loading="eager"` + `fetchpriority="high"` + explizite `width`/`height`.
3. **E3 — Fonts**: Google-Fonts-`@import` aus `global.css` entfernen (Layout-`<link>` bleibt
   einzige Quelle).
4. **E4 — Hydration**: `CookieConsent` + `PortalSidekick` in `Layout.astro` von
   `client:load` → `client:idle`.
5. **Verify**: Struktur-Tests rot→grün in `tests/spec/website-core.bats`;
   `task workspace:validate`; Live-LHCI-Messung nach Prod-Deploy (Ziel ≥ 0.9),
   G-FE05-Eintrag in `.claude/lib/goals.md` aktualisieren.

Design-Spec: `docs/superpowers/specs/2026-07-17-lighthouse-perf-90-design.md`
Intel: `openspec/changes/lighthouse-perf-90/intel.json`

_Ticket: T001922_
