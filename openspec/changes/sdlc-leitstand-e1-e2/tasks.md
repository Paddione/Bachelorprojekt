---
title: "sdlc-leitstand-e1-e2 — Implementation Plan"
ticket_id: T007559
domains: [website, infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T007553
depends_on_plans: []
---

# sdlc-leitstand-e1-e2 — Implementation Plan

_Ticket: T007559 · Epic: T007553 · Design: `openspec/changes/sdlc-leitstand-e1-e2/design.md`_

## File Structure

```
website/src/styles/sdlc-leitstand.css              neu       (p1) Leitstand-Token-Set (--ls-*)
website/src/pages/sdlc/design-system.astro         Umbau     (p1) Showcase des Leitstand DS
design/leitstand-ds/                               neu       (p1) DesignSync-Preview-Bundle (@dsCard)
scripts/sdlc/api-inventory.mjs                     neu       (p2) API-/Connector-Scanner
website/src/data/api-inventory.json                neu       (p2) generiertes Inventar (deterministisch)
docs/agent-guide/registry/api-overlay.yaml         neu       (p2) kuratierte Felder (Merge-Quelle)
Taskfile.yml                                       Erweiterung (p2) api:inventory-Task + freshness-Hooks
.gitattributes                                     Erweiterung (p2) merge=ours für api-inventory.json
tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats   neu       (p3) Token-Guard (RED-first)
tests/spec/sdlc-cockpit/api-inventory-drift.bats   neu       (p3) Inventar-Guard (RED-first)
website/src/data/test-inventory.json               Regenerat (p3) task test:inventory
```

## Partials

| # | Partial-Datei | Rolle | target_files (disjunkt) |
|---|---|---|---|
| p1 | `tasks.d/p1-leitstand-ds.md` | website | `website/src/styles/sdlc-leitstand.css`, `website/src/pages/sdlc/design-system.astro`, `design/leitstand-ds/**` |
| p2 | `tasks.d/p2-api-inventory.md` | infra | `scripts/sdlc/api-inventory.mjs`, `website/src/data/api-inventory.json`, `docs/agent-guide/registry/api-overlay.yaml`, `Taskfile.yml`, `.gitattributes` |
| p3 | `tasks.d/p3-tests.md` | tests | `tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats`, `tests/spec/sdlc-cockpit/api-inventory-drift.bats`, `website/src/data/test-inventory.json` |

Ausführungsregeln: p1 ∥ p2 parallel möglich (keine Datei-Überlappung); p3 ist das
Tests-Partial und läuft zuletzt. Keine Datei liegt in zwei Partials (D1).

## S1-Budgets (wirksame Schwelle je bestehender Datei)

| Datei | Ist | Budget |
|---|---|---|
| `website/src/pages/sdlc/design-system.astro` | 230 | 770 |

Ermittelt gegen `docs/code-quality/baseline.json` (nicht-baselined) und
`docs/code-quality/gates.yaml` (`.astro` 1000). Neue Dateien werden mit
Wachstumsreserve unter ihrem Extension-Limit geschnitten (`.mjs` 800; `.css` führt
kein S1-Limit). `Taskfile.yml`/`.gitattributes` erhalten nur kleine additive Blöcke —
`.github/workflows/ci.yml` bleibt unberührt, weil der generische `freshness:check`-Step
neu registrierte Artefakte bereits abdeckt (Befund p2).

<!-- vitest: kein neuer Test nötig, weil dieser Change keine Dateien unter
website/src/lib/** oder website/src/pages/api/** anlegt oder ändert; der Scanner
(.mjs unter scripts/) und das Token-CSS werden durch die BATS-Guards aus p3
output-verifiziert. -->

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** p3 legt die beiden BATS-Guards an. Sie MÜSSEN auf
      dem aktuellen Branch fehlschlagen, weil Token-CSS und Scanner noch nicht
      existieren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL (rot — sdlc-leitstand.css und scripts/sdlc/api-inventory.mjs fehlen noch)
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
