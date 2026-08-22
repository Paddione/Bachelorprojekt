---
title: "Rollup archive no-merge and backlog carry-over"
ticket_id: T013330
domains: [factory, openspec, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rollup-archive-no-merge — Implementation Plan

_Ticket: T013330_

## File Structure

```
scripts/devflow-post-merge-finalize.sh                         # Slug-spezifischer Archivmodus
scripts/factory/rollup-carryover.sh                            # Alle offenen, unarchivierten Zyklen scannen
tests/spec/openspec-workflow/archive-status-offline-staging.bats # Finalizer-Regression
tests/spec/mishap-rollup/rollup-carryover.bats                 # Backlog-Scan-Regression
openspec/specs/mishap-rollup.md                                # SSOT nach Delta-Merge
openspec/changes/rollup-archive-no-merge/specs/mishap-rollup.md # Requirement-Delta
```

## S1 Budgets

| Datei | Ist | Wirksames Budget |
|---|---:|---:|
| `scripts/devflow-post-merge-finalize.sh` | 555 | 245 |
| `scripts/factory/rollup-carryover.sh` | 124 | 676 |

Die beiden BATS-Dateien und Markdown-Specs sind nicht baselined und haben in
`docs/code-quality/gates.yaml` kein eigenes S1-Extension-Limit. Keine Baseline-
Ausnahme wird ergänzt.

## Partials

1. `p1-finalizer`: Finalizer und Mishap-Archivsemantik.
2. `p2-carryover`: Backlog-Scan und SSOT-Anpassung.
3. `p3-tests`: RED-Tests auf GREEN bringen und Regressionen prüfen.

## Tasks

- [ ] **Failing-Test-Step (RED).** Die beiden T013330-Regressionstests gezielt
      ausführen. Der Finalizer-Test scheitert am fehlenden `--no-merge`; der
      Carry-over-Test scheitert, weil nur ein Kandidat ausgegeben wird.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/openspec-workflow/archive-status-offline-staging.bats \
  tests/spec/mishap-rollup/rollup-carryover.bats
# expected: FAIL (2 T013330-Tests rot; bestehende Regressionen grün)
```

- [ ] **Finalizer-Fix (GREEN).** In `scripts/devflow-post-merge-finalize.sh`
      vor dem Archivaufruf ein Argument-Array bestimmen: Slugs mit Präfix
      `mishap-incident-rollup-` erhalten `--no-merge`, alle anderen keine
      Zusatzargumente. Den Befehl weiterhin genau einmal im bestehenden
      Archiv-Branch/Trap-Pfad ausführen. Danach den Finalizer-Test einzeln
      ausführen.

- [ ] **Carry-over-Fix (GREEN).** In `scripts/factory/rollup-carryover.sh` nur
      direkte `openspec/changes/mishap-incident-rollup-*/tasks.md`-Kandidaten
      sammeln, das `tail -1` entfernen und alle qualifizierten Kandidaten nach
      Zyklusdatum sortiert ausgeben. Den bestehenden Test „nur der jüngste
      Zyklus“ auf die neue SSOT-Semantik umstellen; Selbstzyklus-, resolved-
      und Exit-3-Verhalten erhalten. Danach das komplette Carry-over-BATS-
      Bundle ausführen.

- [ ] **SSOT synchronisieren.** Das MODIFIED-Delta nach
      `openspec/specs/mishap-rollup.md` übernehmen: Prozessnotizen werden mit
      `--no-merge` statt `--create-new` archiviert; alle unarchivierten
      checkbox-basierten Zyklen werden übertragen. Keine heuristische
      Rückwirkung für alte Pläne ohne Checkboxen ergänzen.

- [ ] **Testinventar aktualisieren.** Weil bestehende BATS-Dateien geändert
      wurden, `task test:inventory` ausführen und die resultierende
      `components/website/src/data/test-inventory.json`-Änderung mitführen.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
