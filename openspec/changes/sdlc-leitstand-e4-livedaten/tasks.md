---
title: "sdlc-leitstand-e4-livedaten — Implementation Plan"
ticket_id: T008016
domains: [website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T007553
depends_on_plans: []
---

# sdlc-leitstand-e4-livedaten — Implementation Plan

_Ticket: T008016 · Epic: T007553 · Design: `docs/superpowers/specs/2026-08-15-sdlc-leitstand-design.md` §S6 · Voraussetzung: E3-Merge (T007957, blocked_by-Link)_

## File Structure

```
components/website/src/components/leitstand/decks/DeckPlattform.svelte  Umbau  (p1) echte Quellen: FactoryObservability + K8s-Karten
components/website/src/components/leitstand/KpiGrid.svelte              neu    (p1) Z4-Leerlauf: DORA + Factory-KPIs
components/website/src/components/leitstand/Kontextzone.svelte          Umbau  (p1) Leerlauf → KpiGrid
components/website/src/lib/sdlc/leitstand-kpi.ts                        neu    (p1) pure DORA-Aggregation aus delivery-metrics
components/website/src/lib/sdlc/leitstand-purpose-registry.ts           Umbau  (p1) Einträge KpiGrid + ApiKatalog (Registry-Pflege komplett in p1)
components/website/src/middleware/redirect-map.ts                       Umbau  (p1) /sdlc/observability → /sdlc/cockpit?deck=plattform
components/website/src/pages/sdlc/observability.astro                   LÖSCHEN (p1) Fake-Uptime-Platzhalter
components/website/src/components/sdlc/factory/KostenTab.svelte         LÖSCHEN (p1) verwaist
components/website/src/components/DeliveryHistory.svelte                LÖSCHEN (p1) verwaist; DORA lebt in KpiGrid
components/website/src/pages/sdlc/api/factory-floor/stream.ts           Umbau  (p2) setInterval-Poll → cockpit-listen-hub
components/website/src/components/leitstand/ApiKatalog.svelte           neu    (p2) Katalog-UI aus api-inventory.json
components/website/src/components/leitstand/decks/DeckWissen.svelte     Umbau  (p2) ApiKatalog einbinden
components/website/src/pages/sdlc/api/mcp-health.ts                     neu    (p2) server-seitiger MCP-Health-Proxy
components/website/src/lib/sdlc/__tests__/leitstand-kpi.test.ts         neu    (p3) vitest
components/website/src/middleware/redirect-map.test.ts                  Anpassung (p3) Spiegel-Eintrag observability
tests/spec/sdlc-cockpit/leitstand-livedaten.bats                        neu    (p3) Guards (RED)
scripts/sdlc-cockpit-smoke.mjs                                          Erweiterung (p3) Deck-Live-/Katalog-Checks
components/website/src/data/test-inventory.json                        Regenerat (p3)
```

## Partials

| # | Partial-Datei | Rolle | target_files (disjunkt) |
|---|---|---|---|
| p1 | `tasks.d/p1-plattform-kpi.md` | website | `components/website/src/components/leitstand/decks/DeckPlattform.svelte`, `components/website/src/components/leitstand/KpiGrid.svelte`, `components/website/src/components/leitstand/Kontextzone.svelte`, `components/website/src/lib/sdlc/leitstand-kpi.ts`, `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`, `components/website/src/middleware/redirect-map.ts`, `components/website/src/pages/sdlc/observability.astro`, `components/website/src/components/sdlc/factory/KostenTab.svelte`, `components/website/src/components/DeliveryHistory.svelte` |
| p2 | `tasks.d/p2-realtime-katalog.md` | website | `components/website/src/pages/sdlc/api/factory-floor/stream.ts`, `components/website/src/components/leitstand/ApiKatalog.svelte`, `components/website/src/components/leitstand/decks/DeckWissen.svelte`, `components/website/src/pages/sdlc/api/mcp-health.ts` |
| p3 | `tasks.d/p3-tests.md` | tests | `components/website/src/lib/sdlc/__tests__/leitstand-kpi.test.ts`, `components/website/src/middleware/redirect-map.test.ts`, `tests/spec/sdlc-cockpit/leitstand-livedaten.bats`, `scripts/sdlc-cockpit-smoke.mjs`, `components/website/src/data/test-inventory.json` |

Ausführungsregeln: p1 ∥ p2 parallel möglich (disjunkte Datei-Ownership; die
purpose-Registry-Einträge für die p2-Komponente `ApiKatalog` schreibt p1, damit die Registry
nur einem Partial gehört); p3 ist das Tests-Partial und läuft zuletzt. Keine Datei liegt in
zwei Partials (D1).

## S1-Budgets (wirksame Schwelle je bestehender Datei, gemessen gegen `60df76fd0` auf main)

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/pages/sdlc/api/factory-floor/stream.ts` | 68 | 832 |
| `components/website/src/middleware/redirect-map.ts` | 51 | 849 |
| `scripts/sdlc-cockpit-smoke.mjs` | 123* | 677 |

Extension-Limits aus `docs/code-quality/gates.yaml`: `.ts` 900, `.svelte` 1100, `.astro` 1000,
`.mjs` 800; keine der Dateien ist gebaselined. Die E3-Dateien (DeckPlattform, DeckWissen,
Kontextzone, leitstand-purpose-registry) existieren auf main noch nicht — für sie gilt das
volle Extension-Limit als Budget; der Implementer misst den Ist-Stand nach dem E3-Merge nach
(`*` smoke.mjs wird von E3-p3 ebenfalls erweitert; Ist-Wert nach E3-Merge neu messen).
Löschungen (observability.astro, KostenTab, DeliveryHistory) entlasten CQ02 und S1. Neue
Dateien werden mit Wachstumsreserve deutlich unter ihrem Limit geschnitten.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** p3 legt `tests/spec/sdlc-cockpit/leitstand-livedaten.bats`
      an. Der Guard MUSS auf dem Branch-Stand vor p1/p2 fehlschlagen, weil
      `observability.astro` noch existiert, `stream.ts` noch `setInterval`-pollt und kein
      UI-Konsument von `api-inventory.json` existiert:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL (rot — Redirect, LISTEN-Umstellung und Katalog-UI fehlen noch)
```

- [x] **GREEN.** Nach Umsetzung von p1+p2 laufen dieselben Guards grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
```

- [x] **Finale Verifikation (mandatory CI-Gates).**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
