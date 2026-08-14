---
title: "runtime-drift-auto-kill — Implementation Plan"
ticket_id: T004897
domains: [scripts, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# runtime-drift-auto-kill — Implementation Plan

_Ticket: T004897_

## File Structure

```
scripts/runtime-drift-check.sh                                       (p1)
openspec/changes/runtime-drift-auto-kill/specs/batch-repo-hygiene-ops-fixes.md  (Delta-Spec, nicht S1-relevant)
tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats (p2)
```

`scripts/runtime-drift-check.sh` (161 Zeilen) ist nicht gebaselined; wirksame Schwelle ist
das `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`. Die Aenderung umfasst rund 25 Zeilen
(Arg-Parsing + Kill-Logik) — kein Split noetig. Bestandsdatei
`tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` wird nicht angefasst.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-implementierung.md` | impl | `scripts/runtime-drift-check.sh` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats` | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Datei
      `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats` liegt bereits im
      Branch und reproduziert den Defekt: der Guard ignoriert `--auto-kill` still, der
      driftende Prozess ueberlebt und der Exit ist 1 statt 0; unbekannte Argumente werden
      statt mit Exit 2 still ignoriert. Der RED-Stand ist auf dem Branch dokumentiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats
# expected: FAIL — beide Tests rot (Kill fehlt, Arg-Parsing fehlt)
```

- [ ] **GREEN.** Nach p1 (Implementierung) laufen beide Tests durch, der Bestandstest
      `tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats` bleibt gruen
      (Default-Verhalten unveraendert — Guard beendet ohne Flag weiterhin nichts), und die
      Gesamt-Regression ist gruen.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-auto-kill.bats \
  tests/spec/batch-repo-hygiene-ops-fixes/runtime-drift-check.bats
# expected: PASS — alle Tests gruen
```

## Final Verification

- [ ] `task test:changed` — Gesamt-Regression der geaenderten Dateien laeuft gruen
- [ ] `task freshness:regenerate` — Testinventar nach Test-Neuzugang neu erzeugen
- [ ] `task freshness:check` — frisch regeneriertes Inventar konsistent
