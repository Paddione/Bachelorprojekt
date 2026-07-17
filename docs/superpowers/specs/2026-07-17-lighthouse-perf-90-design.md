---
ticket_id: T001922
plan_ref: openspec/changes/lighthouse-perf-90/tasks.md
status: active
date: 2026-07-17
---

# Design: lighthouse-perf-90 — Lighthouse Performance 60 → ≥90 (T001922)

## Problem

Die öffentliche Website (mentolder-Brand, gemessen gegen `https://web.mentolder.de`) erreicht
einen Lighthouse Performance Score von **60/100** (LHCI, 3 Läufe, 2026-07-17, T001911-Baseline):

| Metrik | Wert |
|---|---|
| Performance Score | 60 |
| FCP | 6,0 s |
| LCP | 7,5 s |
| TTI | 7,5 s |
| TBT | **0 ms** |
| CLS | **0** |

TBT 0 ms und CLS 0 zeigen: Das ist **kein JS-Ausführungs- oder Layout-Problem**, sondern ein
**Auslieferungsproblem** (Transfergröße + Request-Ketten). Die Audit-Opportunities bestätigen das:

1. **Fehlende Text-Compression** — ~622 KiB Einsparpotenzial (größter Hebel)
2. **Unused JavaScript** — ~278 KiB
3. **Responsive Images** — ~146 KiB

## Root-Causes (Exploration 2026-07-17)

- **Keine Kompression in der Auslieferungskette**: Der Astro-Node-Adapter (`output: 'server'`,
  standalone) komprimiert Responses nicht; die Traefik-`IngressRoute` der Website
  (`k3d/website.yaml`) hat **keine** `compress`-Middleware — anders als andere Services im Cluster.
- **LCP-Element sabotiert sich selbst**: Hero-Portrait `public/gerald.jpg` (176 KB) wird als rohes
  `<img>` mit `loading="lazy"` geladen (`Portrait.svelte:31`) — lazy auf dem Above-the-fold-LCP-Bild
  verzögert den LCP künstlich. Ein fertiges `public/gerald.webp` (**17 KB**, −90 %) liegt ungenutzt
  daneben (`mentolder.ts:81` referenziert `/gerald.jpg`). Kein `width`/`height`-Attribut.
- **Fonts doppelt geladen**: Google Fonts via `<link>` in `Layout.astro:83` **und** nochmal via
  `@import` in `global.css:2` — zwei Request-Ketten für dieselben Fonts.
- **Zu viel eager Hydration**: `CookieConsent` und `PortalSidekick` sind `client:load`
  (`Layout.astro:101-102`), obwohl beide nicht render-kritisch sind.
- **Keine Cache-Header** für die inhalts-gehashten `/_astro/`-Assets.

## Lösung (Entscheidungen aus Brainstorming, `.lavish/lighthouse-perf-90-brainstorm.html`)

### E1 — Traefik-Middleware für Kompression + Static-Cache (größter Hebel, infra-only)
In `k3d/website.yaml` zwei Middlewares ergänzen und an die IngressRoute binden:
- `website-compress` (`compress: {}`) — gzip/brotli am Edge, wirkt auf HTML/JS/CSS/JSON.
- `website-static-cache` — `Cache-Control: public, max-age=31536000, immutable` für `/_astro/`
  (eigene Route-Rule mit PathPrefix, die gehashten Assets sind per Konstruktion immutable).
Da `k3d/` die Kustomize-Base ist, profitieren **beide Brands** (mentolder + korczewski) ohne
Overlay-Änderung. Kein App-Code, kein Pod-CPU-Overhead.

### E2 — LCP-Bild reparieren (Quick-Win, 10x-Ersparnis liegt fertig im Repo)
- `mentolder.ts` `avatarSrc: '/gerald.jpg'` → `'/gerald.webp'` (176 KB → 17 KB).
- `Portrait.svelte`: `loading="lazy"` → `loading="eager"` + `fetchpriority="high"` +
  explizite `width`/`height` (intrinsische Maße des WebP) — Portrait ist ausschließlich
  Above-the-fold im Hero im Einsatz.
- Verworfen: `astro:assets`-Umbau — invasiver bei identischem Effekt für dieses eine Bild.

### E3 — Font-Doppel-Ladung eliminieren
`@import url(...googleapis...)` aus `global.css` entfernen. Der `<link rel="stylesheet">` in
`Layout.astro` (mit vorhandenem `preconnect` + `display=swap`) bleibt einzige Font-Quelle.
Verworfen (für dieses Ticket): Self-Hosting via `@fontsource` — Follow-up, falls Score <90 bleibt.

### E4 — Hydration-Downgrade nicht-kritischer Islands
`Layout.astro`: `CookieConsent` und `PortalSidekick` von `client:load` → `client:idle`.
`Navigation` und `Hero` bleiben `client:load` (interaktiv above-the-fold).
Verworfen: React-Entfernung von Public-Seiten — zu invasiv, eigenes Ticket falls nötig.

## Nicht-Ziele
- Kein `astro:assets`-Gesamtumbau, kein Font-Self-Hosting, kein Framework-Removal.
- Keine Änderung an `lighthouserc.json`-Assertions (Ziel ≥0.9 steht dort bereits).
- korczewski-spezifische Bild-Optimierung (kore-Pfad nutzt eigene Assets) — nur wenn trivial.

## Verifikation
- **Offline (CI-fähig, rot→grün)**: Struktur-Tests in `tests/spec/website-core.bats`:
  Middleware in `k3d/website.yaml` vorhanden + von IngressRoute referenziert; `global.css`
  ohne Google-Fonts-`@import`; `Portrait.svelte` ohne `loading="lazy"`; `mentolder.ts`
  referenziert `.webp`. Dazu `task workspace:validate` (Kustomize-Build grün).
- **Live (nach Merge + Prod-Deploy)**: `npx @lhci/cli autorun --collect.url=https://web.mentolder.de`
  — Ziel: Performance ≥ 0.9, Kompressions-Opportunity verschwunden, LCP < 3,5 s.
  Goals-Eintrag G-FE05 in `.claude/lib/goals.md` mit neuem Messwert aktualisieren.

## Risiken
- Traefik-`compress`-Middleware und SSE-Endpoints (`/api/admin/ops/server-logs/stream`):
  Traefik komprimiert `text/event-stream` standardmäßig nicht (excludedContentTypes-Default) —
  im Test verifizieren, dass SSE-Streams weiter funktionieren.
- `client:idle` für CookieConsent verzögert den Consent-Banner minimal — akzeptiert,
  Banner ist nicht render-kritisch.
