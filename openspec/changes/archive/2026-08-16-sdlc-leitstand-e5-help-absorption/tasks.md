---
title: "sdlc-leitstand-e5-help-absorption — Implementation Plan"
ticket_id: T008017
domains: [website, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T007553
depends_on_plans: []
---

# sdlc-leitstand-e5-help-absorption — Implementation Plan

_Ticket: T008017 · Epic: T007553 · Design: `docs/superpowers/specs/2026-08-15-sdlc-leitstand-design.md` §S3 · Voraussetzung: E3- und E4-Merge (blocked_by T007957, T008016)_

## File Structure

```
components/website/src/components/leitstand/HelpOverlay.svelte           neu    (p1) Overlay-Layer aus purpose-Registry
components/website/src/components/leitstand/LeitstandStatusband.svelte   Umbau  (p1) [?]-Toggle verdrahten
components/website/src/lib/sdlc/leitstand-purpose-registry.ts            Umbau  (p1) data-purpose-id-Schlüssel als Anker-Kontrakt
components/website/src/pages/sdlc/cockpit.astro                          Umbau  (p1) HelpOverlay mounten + .report-Ansicht
components/website/src/styles/sdlc-leitstand.css                         Erweiterung (p1) Print-Light/.report + Glow-Disziplin
components/website/src/middleware/redirect-map.ts                        Umbau  (p2) 3 Absorptions-Redirects + ?tab=-Normalisierung
components/website/src/pages/sdlc/repohealth.astro                       LÖSCHEN (p2) → ?deck=qualitaet
components/website/src/pages/sdlc/prompts.astro                          LÖSCHEN (p2) → ?deck=wissen
components/website/src/pages/sdlc/ki-konfiguration.astro                 LÖSCHEN (p2) → ?deck=ki
components/website/src/components/leitstand/decks/DeckWissen.svelte      Umbau  (p2) PromptLibraryManager-Modul
components/website/src/components/leitstand/decks/DeckKi.svelte          Umbau  (p2) KiKonfiguration-Modul
tests/spec/sdlc-cockpit/leitstand-help-overlay.bats                      neu    (p3) Guard (RED)
tests/spec/sdlc-cockpit/leitstand-absorption.bats                        neu    (p3) Guard (RED)
components/website/src/middleware/redirect-map.test.ts                   Anpassung (p3) Spiegel-Einträge + kein ?tab=
components/website/src/lib/sdlc/__tests__/help-overlay-anchors.test.ts   neu    (p3) vitest Anker↔Registry
scripts/sdlc-cockpit-smoke.mjs                                           Erweiterung (p3) Overlay-/Redirect-Checks
components/website/src/data/test-inventory.json                          Regenerat (p3)
```

## Partials

| # | Partial-Datei | Rolle | target_files (disjunkt) |
|---|---|---|---|
| p1 | `tasks.d/p1-help-overlay-print.md` | website | `components/website/src/components/leitstand/HelpOverlay.svelte`, `components/website/src/components/leitstand/LeitstandStatusband.svelte`, `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`, `components/website/src/pages/sdlc/cockpit.astro`, `components/website/src/styles/sdlc-leitstand.css` |
| p2 | `tasks.d/p2-absorption.md` | website | `components/website/src/middleware/redirect-map.ts`, `components/website/src/pages/sdlc/repohealth.astro`, `components/website/src/pages/sdlc/prompts.astro`, `components/website/src/pages/sdlc/ki-konfiguration.astro`, `components/website/src/components/leitstand/decks/DeckWissen.svelte`, `components/website/src/components/leitstand/decks/DeckKi.svelte` |
| p3 | `tasks.d/p3-tests.md` | tests | `tests/spec/sdlc-cockpit/leitstand-help-overlay.bats`, `tests/spec/sdlc-cockpit/leitstand-absorption.bats`, `components/website/src/middleware/redirect-map.test.ts`, `components/website/src/lib/sdlc/__tests__/help-overlay-anchors.test.ts`, `scripts/sdlc-cockpit-smoke.mjs`, `components/website/src/data/test-inventory.json` |

Ausführungsregeln: p1 ∥ p2 parallel möglich (disjunkte Datei-Ownership; die
`data-purpose-id`-Anker in den Deck-Dateien setzt p2 in seinen eigenen Dateien, der
Anker-Kontrakt selbst gehört p1 über die Registry); p3 ist das Tests-Partial und läuft
zuletzt. Keine Datei liegt in zwei Partials (D1).

## S1-Budgets (wirksame Schwelle je bestehender Datei, gemessen gegen `60df76fd0` auf main)

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/pages/sdlc/cockpit.astro` | 226* | 774 |
| `components/website/src/styles/sdlc-leitstand.css` | 98 | — (kein `.css`-Limit in gates.yaml; Richtwert ≤ 400) |
| `components/website/src/middleware/redirect-map.ts` | 51* | 849 |
| `scripts/sdlc-cockpit-smoke.mjs` | 123* | 677 |

Extension-Limits aus `docs/code-quality/gates.yaml`: `.ts` 900, `.svelte` 1100, `.astro` 1000,
`.mjs` 800; keine Datei gebaselined. `*` = Datei wird von E3/E4 ebenfalls geändert — Ist-Wert
nach deren Merge nachmessen; für die E3-Dateien (LeitstandStatusband, DeckWissen, DeckKi,
leitstand-purpose-registry) gilt bis dahin das volle Extension-Limit als Budget. Löschungen
(repohealth/prompts/ki-konfiguration) entlasten CQ02 und S1.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** p3 legt die Guards an. Sie MÜSSEN auf dem Branch-Stand vor
      p1/p2 fehlschlagen, weil HelpOverlay und die Absorptions-Redirects noch nicht
      existieren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL (rot — HelpOverlay.svelte fehlt, redirect-map ohne Absorptions-Einträge)
```

- [ ] **GREEN.** Nach Umsetzung von p1+p2 laufen dieselben Guards grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
```

- [ ] **Finale Verifikation (mandatory CI-Gates).**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
