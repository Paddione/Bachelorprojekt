---
title: "plan-intel-risks-dedupe — Implementation Plan"
ticket_id: T002515
domains: [dev-tooling, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-intel-risks-dedupe — Implementation Plan

_Ticket: T002515_

## File Structure

```
scripts/plan-intel.sh                                  (geändert — Merge dedupliziert risks[])
tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats  (neu — RED-Test, liegt bereits im Stage-Commit)
openspec/changes/plan-intel-risks-dedupe/              (neu — proposal, design, Delta-Spec, dieser Plan)
website/src/data/test-inventory.json                   (regeneriert — task test:inventory)
website/src/data/openspec-status.json                  (regeneriert — openspec.sh propose)
```

### S1-Budget

| Datei | Ist | Budget |
| `scripts/plan-intel.sh` | 209 | 591 |

`scripts/plan-intel.sh` ist nicht gebaselined (`jq '."S1:scripts/plan-intel.sh".metric'` →
`null`), die wirksame Schwelle ist deshalb das statische `.sh`-Limit 800 aus
`docs/code-quality/gates.yaml`. Die Änderung ersetzt eine Zeile durch eine Zeile plus einen
Kommentarblock; ein Split ist bei diesem Budget nicht erforderlich.

`tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats` ist neu; `.bats` steht nicht in
`s1.limits` und wird von S1 nicht gemessen.

## Task 1 — RED: der Test schlägt aus dem richtigen Grund fehl

Der Test liegt bereits auf dem Branch (Stage-Commit). Dieser Schritt verifiziert vor jeder
Code-Änderung, dass er den gemeldeten Defekt misst und nicht ein Setup-Problem.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
# expected: FAIL — Test 1 und Test 2 sind rot, Test 3 und Test 4 sind grün.
```

Erwartete Diagnose bei Test 1: `risks[] nach drei Laeufen: 3 Eintraege, aber nur 1
verschiedene`. Erwartete Diagnose bei Test 2: der Diff zwischen Lauf 2 und Lauf 3 zeigt genau
ein zusätzlich angehängtes Risiko-Objekt.

Dass Test 3 (manuell ergänztes Risiko überlebt) und Test 4 (`api_contracts` bleiben erhalten)
schon jetzt grün sind, ist beabsichtigt: sie sind Regressionsschutz gegen ein überschießendes
Dedupe und müssen nach dem Fix grün bleiben.

## Task 2 — GREEN: risks[] beim Merge nach (note, severity) deduplizieren

In `scripts/plan-intel.sh` den Merge-Block bei Zeile 168-170 anpassen:

```bash
if [[ -n "${RISKS_EXTRA:-}" && "$RISKS_EXTRA" != "[]" ]]; then
  # [T002515] unique_by, weil der Generator RISK_CODEBASE bei JEDEM Lauf neu erzeugt und
  # RISKS_EXTRA den risks[]-Block des vorherigen Laufs traegt — inklusive derselben
  # Meldung. Ohne Dedupe waechst risks[] um genau einen Eintrag pro Lauf und jeder
  # Testlauf hinterlaesst eine geaenderte, committbare Datei.
  # Der Schluessel ist (note, severity): manuell ergaenzte Risiken mit abweichendem note
  # ueberleben, nur die Generator-Duplikate fallen weg.
  RISKS="$(echo "$RISKS" | jq --argjson re "$RISKS_EXTRA" '. + $re | unique_by([.note, .severity])')"
fi
```

`api_contracts` und `external_types` (Zeile 51-52) bleiben unverändert — sie werden nicht neu
generiert und akkumulieren deshalb nicht.

Erwartete Nebenwirkung, bewusst in Kauf genommen: `unique_by` sortiert nach dem
Vergleichsschlüssel. Die Reihenfolge in `risks[]` wird dadurch deterministisch, aber nicht mehr
„generierter Eintrag zuerst". Das Bundle-Schema schreibt keine Reihenfolge vor, und
Determinismus ist für einen als deterministisch deklarierten Generator der höhere Wert.

Danach erneut:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
# expected: PASS — alle vier Tests grün.
```

## Task 3 — Bestehende Generator-Tests gegenprüfen

`tests/spec/dev-flow-plan/task-context.bats` deckt den Generator mit elf Tests ab, darunter
`TCC-gen: nicht erreichbare Quelle erzeugt risks[] mit severity:warn` und `TCC-gen: vorhandene
api_contracts ueberleben erneuten Lauf`. Beide dürfen von der Änderung nicht berührt werden.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/
# expected: PASS — alle Tests beider Dateien grün.
```

Anschließend prüfen, dass der Lauf keine Datei im Arbeitsbaum zurücklässt — das ist die
eigentliche Wirkung, die das Ticket verlangt:

```bash
git status --porcelain
# erwartet: keine Ausgabe (kein modifiziertes intel.json eines fremden Change-Slugs)
```

## Task 4 — Finale Verifikation

Nach der Test-Änderung muss das Test-Inventar regeneriert und mitcommittet werden, sonst wird
CI rot:

```bash
task test:inventory
```

Danach die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
