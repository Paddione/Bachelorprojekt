---
title: "mishap-t001927 — Implementation Plan"
ticket_id: T001927
domains: [ops]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001927 — Implementation Plan

_Ticket: T001927_

## File Structure

- `.githooks/pre-push` — fix: BATS-Advisory nur bei echtem Regenerations-Diff warnen
- `tests/unit/freshness-graph.bats` — neuer `@test` für die Diff-Aware-Heuristik

## Tasks

### Task 1: Fix pre-push BATS-Advisory (echter Diff statt reiner Anwesenheitsprüfung)

**Komponente:** `.githooks/pre-push`, Abschnitt "Advisory: BATS changed without repo-index/test-inventory update" (aktuell Zeilen ~32-58).

**Problem:** Die Heuristik prüft nur `CHANGED_BATS` (BATS-Datei im Push) `∧` `CHANGED_INDEX` leer (repo-index.json/test-inventory.json NICHT im Push) und warnt dann unbedingt (Zeile 53-58). Sie prüft nicht, ob `task freshness:regenerate` tatsächlich einen Diff an `docs/code-quality/repo-index.json` bzw. `website/src/data/test-inventory.json` erzeugen würde. Dadurch warnt der Hook auch dann, wenn die Regeneration keinen Unterschied produziert (z. B. neuer `@test` in einer bereits erfassten Datei ohne Inventory-relevante Änderung), was zu unnötigen amend/force-push-Zyklen führt.

**Fix:** Vor der Warnung in `.githooks/pre-push` (Zeile ~53) einen echten Diff-Check einbauen: `task freshness:regenerate` in eine temporäre Kopie/Worktree-freie Prüfung laufen lassen (oder die generierten Dateien nach Regeneration per `git diff --stat -- docs/code-quality/repo-index.json website/src/data/test-inventory.json` bzw. Hash-Vergleich mit dem committeten Stand abgleichen) und nur warnen, wenn dieser Diff nicht leer ist. Ergebnis: Der Advisory-Text bleibt wortgleich (`BATS-Dateien geändert, aber repo-index.json/test-inventory.json fehlen im Push.`), erscheint aber nur noch, wenn eine Regeneration tatsächlich einen Unterschied ergäbe.

**Steps:**
- `grep -n 'CHANGED_BATS\|CHANGED_INDEX\|warn' .githooks/pre-push`
- Diff-Check ergänzen (Regeneration + Vergleich) bevor `warn` aufgerufen wird
- Manuell verifizieren: Push mit geänderter BATS-Datei ohne Inventory-Diff erzeugt KEINE Warnung mehr; Push mit BATS-Datei, die tatsächlich neue Testfälle im Inventory erzeugt, warnt weiterhin

### Task 2: Failing-Test-Step (RED)

Test in einer bestehenden BATS-Datei ergänzen, die die Freshness-Logik abdeckt: `tests/unit/freshness-graph.bats`. Der neue Test simuliert den Mishap-Fall (BATS-Datei geändert, aber Regeneration ergibt keinen Diff) und muss auf dem aktuellen Branch fehlschlagen, weil der Hook noch unbedingt warnt.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/freshness-graph.bats
# expected: FAIL (red — die Diff-Aware-Heuristik in .githooks/pre-push ist noch nicht implementiert)
```

### Task 3: Fix-Step (GREEN)

Implementiere den in Task 1 beschriebenen Fix in `.githooks/pre-push`. Der in Task 2 hinzugefügte Test muss danach grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/freshness-graph.bats
```

### Task 4: Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
