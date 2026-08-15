---
title: "sdlc-leitstand-e3-shell — Implementation Plan"
ticket_id: T007957
domains: [website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T007553
depends_on_plans: []
---

# sdlc-leitstand-e3-shell — Implementation Plan

_Ticket: T007957 · Epic: T007553 · Design: `openspec/changes/sdlc-leitstand-e3-shell/design.md`_

## File Structure

```
components/website/src/pages/sdlc/cockpit.astro                       Umbau   (p1) 5-Zonen-Shell, URL-Weiche
components/website/src/components/leitstand/LeitstandStatusband.svelte neu    (p1) Z1
components/website/src/components/leitstand/Kontextzone.svelte         neu    (p1) Z4-Router
components/website/src/components/sdlc/FactoryFloor.svelte             Umbau  (p1) Zonen-Controller (Store bleibt)
components/website/src/components/sdlc/factory/ConveyorBelt.svelte     Umbau  (p1) Kanban→Achse
components/website/src/components/sdlc/factory/StationColumn.svelte    Umbau  (p1) kompakte Station
components/website/src/components/sdlc/factory/AttentionStrip.svelte   Umbau  (p1) Z2 hochgezogen
components/website/src/components/sdlc/factory/MobileTabBar.svelte     Umbau  (p1) Zonen-Stapel mobil
components/website/src/components/PlanningOffice.svelte                Umbau  (p1) Stations-Filter-Prop
components/website/src/lib/sdlc/leitstand-metrics.ts                   neu    (p1) Metrik-Extrakt aus CockpitRail
components/website/src/lib/sdlc/leitstand-url.ts                       neu    (p1) Query-Schema + Legacy-Mapping
components/website/src/lib/sdlc/leitstand-purpose-registry.ts          neu    (p1) purpose-Registry
components/website/src/components/cockpit/CommandBar.svelte            LÖSCHEN (p1)
components/website/src/components/cockpit/CockpitRail.svelte           LÖSCHEN (p1)
components/website/src/components/cockpit/OverviewDashboard.svelte     LÖSCHEN (p1)
components/website/src/components/leitstand/DeckLeiste.svelte          neu    (p2) Z5-Umschalter
components/website/src/components/leitstand/decks/DeckQualitaet.svelte neu    (p2) GoalsDashboard-Modul
components/website/src/components/leitstand/decks/DeckPlattform.svelte neu    (p2) Kill-Switch/Budget/Observability-Karten
components/website/src/components/leitstand/decks/DeckKi.svelte        neu    (p2) LLM-/Routing-/Slots-/Dispatch-/Insights
components/website/src/components/leitstand/decks/DeckWissen.svelte    neu    (p2) API-Katalog-Kachel + OpenSpec-Suche
components/website/src/components/DevStatusTabs.svelte                 LÖSCHEN (p2) toter Code
components/website/src/lib/sdlc/__tests__/leitstand-metrics.test.ts    neu    (p3) vitest
components/website/src/lib/sdlc/__tests__/leitstand-url.test.ts        neu    (p3) vitest
components/website/src/lib/sdlc/__tests__/leitstand-purpose-registry.test.ts neu (p3) vitest
tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats                neu    (p3) Guard (RED)
tests/spec/sdlc-cockpit/leitstand-url-scheme.bats                      neu    (p3) Guard (RED)
scripts/sdlc-cockpit-smoke.mjs                                         Erweiterung (p3) Zonen+testid-Checks
tests/spec/pipeline-interface.bats                                     Anpassung (p3) D7.2 referenziert DevStatusTabs
tests/spec/sdlc-cockpit/layout-rail-fixed.bats                         Anpassung (p3) T003417 verlangt CockpitRail in cockpit.astro
components/website/src/data/test-inventory.json                        Regenerat (p3)
```

## Partials

| # | Partial-Datei | Rolle | target_files (disjunkt) |
|---|---|---|---|
| p1 | `tasks.d/p1-zonen-shell.md` | website | `components/website/src/pages/sdlc/cockpit.astro`, `components/website/src/components/leitstand/LeitstandStatusband.svelte`, `components/website/src/components/leitstand/Kontextzone.svelte`, `components/website/src/components/sdlc/FactoryFloor.svelte`, `components/website/src/components/sdlc/factory/ConveyorBelt.svelte`, `components/website/src/components/sdlc/factory/StationColumn.svelte`, `components/website/src/components/sdlc/factory/AttentionStrip.svelte`, `components/website/src/components/sdlc/factory/MobileTabBar.svelte`, `components/website/src/components/PlanningOffice.svelte`, `components/website/src/lib/sdlc/leitstand-metrics.ts`, `components/website/src/lib/sdlc/leitstand-url.ts`, `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`, `components/website/src/components/cockpit/CommandBar.svelte`, `components/website/src/components/cockpit/CockpitRail.svelte`, `components/website/src/components/cockpit/OverviewDashboard.svelte` |
| p2 | `tasks.d/p2-decks.md` | website | `components/website/src/components/leitstand/DeckLeiste.svelte`, `components/website/src/components/leitstand/decks/*.svelte`, `components/website/src/components/DevStatusTabs.svelte` |
| p3 | `tasks.d/p3-tests.md` | tests | `tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats`, `tests/spec/sdlc-cockpit/leitstand-url-scheme.bats`, `components/website/src/lib/sdlc/__tests__/leitstand-metrics.test.ts`, `components/website/src/lib/sdlc/__tests__/leitstand-url.test.ts`, `components/website/src/lib/sdlc/__tests__/leitstand-purpose-registry.test.ts`, `scripts/sdlc-cockpit-smoke.mjs`, `tests/spec/pipeline-interface.bats`, `tests/spec/sdlc-cockpit/layout-rail-fixed.bats`, `components/website/src/data/test-inventory.json` |

Hinweis: Die Löschdateien (CommandBar/CockpitRail/OverviewDashboard/DevStatusTabs) stehen als
normale Pfade in den target_files-Zellen, weil plan-intel.sh dort keine Präfixe/Globs parst;
„löschen"-Status ergibt sich aus der File-Structure-Spalte oben.

Ausführungsregeln: p1 ∥ p2 parallel möglich (Import-Richtung `cockpit.astro` → `DeckLeiste`
ist erlaubt, Datei-Ownership bleibt disjunkt); p3 ist das Tests-Partial und läuft zuletzt.
Keine Datei liegt in zwei Partials (D1).

> Hinweis für den Implementer (außerhalb des Partial-Scopes, von p3 geflaggt): Nach der
> `DevStatusTabs`-Löschung existieren zwei weitere textuelle Stale-Referenzen —
> `tests/e2e/specs/fa-48-factory-devflow.spec.ts` und
> `tests/factory-eval/fixtures/T000726/expected.json`. Beide brechen voraussichtlich
> nicht (textuelle Verweise, kein Datei-Import), im Verify-Schritt aber gegenprüfen;
> E2E-Anpassungen gehören ggf. in einen dev-flow-e2e-Folgeschritt. Gleiches gilt für
> `tests/e2e/specs/fa-58-admin-cockpit.spec.ts` (`.cockpit-rail-group`-Selektor — die
> Rail entfällt; der Spec läuft nightly gegen die Brands und braucht nach dem Deploy
> der Shell eine dev-flow-e2e-Anpassung, sonst wird der Nightly rot).

## S1-Budgets (wirksame Schwelle je bestehender Datei, gemessen gegen `14e0c2b6c`)

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/pages/sdlc/cockpit.astro` | 226 | 774 |
| `components/website/src/components/sdlc/FactoryFloor.svelte` | 332 | 768 |
| `components/website/src/components/sdlc/factory/ConveyorBelt.svelte` | 60 | 1040 |
| `components/website/src/components/sdlc/factory/StationColumn.svelte` | 261 | 839 |
| `components/website/src/components/sdlc/factory/AttentionStrip.svelte` | 18 | 1082 |
| `components/website/src/components/sdlc/factory/MobileTabBar.svelte` | 84 | 1016 |
| `components/website/src/components/PlanningOffice.svelte` | 433 | 667 |
| `scripts/sdlc-cockpit-smoke.mjs` | 123 | 677 |

Alle Dateien nicht-baselined; wirksame Schwelle = Extension-Limit aus
`docs/code-quality/gates.yaml` (`.astro` 1000, `.svelte` 1100, `.mjs` 800). Neue Dateien
werden mit Wachstumsreserve unter ihrem Limit geschnitten. Gelöschte Dateien
(CommandBar/CockpitRail/OverviewDashboard/DevStatusTabs) entlasten CQ02 und S1.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** p3 legt die BATS-Guards an. Sie MÜSSEN auf dem
      aktuellen Branch fehlschlagen, weil purpose-Registry und URL-Weiche noch nicht
      existieren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL (rot — leitstand-purpose-registry.ts und die Zonen-Shell fehlen noch)
```

- [x] **GREEN.** Nach Umsetzung von p1+p2 laufen dieselben Guards grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# 130/130 ok, BATS_EXIT=0 -- die 5 RED-Failures (102/104/123/125/126) sind
# gruen. Erster Lauf ohne node_modules: 6 Daemon-Tests rot (tsx fehlte);
# nach `npm ci` (via freshness:regenerate) alle gruen. Kein Branch-Regress:
# keine Daemon-Datei geaendert, CI installiert Dependencies selbst.
```

- [x] **Finale Verifikation (mandatory CI-Gates).**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
