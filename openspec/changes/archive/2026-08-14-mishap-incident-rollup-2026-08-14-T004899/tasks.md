---
title: "mishap-incident-rollup-2026-08-14-T004899 — Implementation Plan"
ticket_id: T004899
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-14-T004899 — Implementation Plan

_Container-Ticket: T004899_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-14 11:17 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 2 Eintraege (2026-08-14 11:17 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | scripts/plan-preflight.sh | plan-preflight pre-commit scheitert strukturell an gestagten Plan-Dateien |
| 2 | suspicious | repo/worktrees | Rollup-Worktree von fremdem Cleanup mitten im Lauf entfernt |

**1. plan-preflight pre-commit scheitert strukturell an gestagten Plan-Dateien** (drift, scripts/plan-preflight.sh)

dev-flow-plan Schritt 5 ordnet `plan-preflight.sh pre-commit` VOR `git add && git commit` an — der Guard bricht aber mit „working tree ist nicht sauber" ab, sobald die Plan-Artefakte gestagt sind (verifiziert: rc=1 bei gestagtem chores(plans)-Stage mit nur RED-Test + Change-Dateien). In dieser Reihenfolge kann der Guard nie grün werden; entweder prüft er staged- statt working-tree-Status, oder der Skill-Schritt muss die Reihenfolge ändern. Der Commit lief dennoch korrekt über die .githooks (commit-vs-diff grün).
**2. Rollup-Worktree von fremdem Cleanup mitten im Lauf entfernt** (suspicious, repo/worktrees)

Der Worktree `.worktrees/mishap-incident-rollup` (Branch chore/mishap-incident-rollup) wurde mitten in laufender Arbeit von einem fremden Prozess entfernt: `git worktree list` kannte ihn nicht mehr, das Verzeichnis enthielt nur noch die neu geschriebene Testdatei (verifiziert per worktree list + ls; parallele Session claude --dangerously-skip-permissions lief zeitgleich). Arbeit musste auf fix/-Branch umziehen; der Branch selbst blieb erhalten (ahead 3, behind 132). Ähnlicher Mechanismus wie Buffer-Eintrag „Zweiter Mishap-Rollup-Container": Fremd-Cleanups gegen ungesicherte Verzeichnisse.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
