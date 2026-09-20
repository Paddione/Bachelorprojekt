---
title: "get-timeline-error-visibility — Implementation Plan"
ticket_id: T900239
domains: [scripts]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# get-timeline-error-visibility — Implementation Plan

_Ticket: T900239_

## File Structure

```
scripts/vda/ticket/_ticket-core.sh                                    (CHANGED — _exec_sql errexit fix)
tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats       (NEW — RED/GREEN test)
```

## Task 1: Failing test reproduziert den stillen Abbruch (RED)

Neue Datei `tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats`.
Zwei Tests: ein Positiv-Anker (erfolgreiche `SELECT`-Query läuft unter
`set -euo pipefail` normal durch _exec_sql, Ausführung wird nach dem Aufruf
fortgesetzt) und der eigentliche Bug-Test (ein gestubbtes `kubectl exec`
simuliert einen psql-Fehler unter `ON_ERROR_STOP`: Exit 3 + Fehlertext auf
stderr; `_ticket-core.sh` wird — wie `scripts/ticket.sh` es tut — unter
`set -euo pipefail` gesourct).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats
# expected: FAIL (Test 2 — "column tp.brand does not exist" fehlt im Output,
# weil errexit die Funktion vor dem stderr-Ausgabeblock abbricht)
```

## Task 2: Fix — `_exec_sql` bleibt unter `set -e` bis zum Fehlerausgabeblock (GREEN)

In `scripts/vda/ticket/_ticket-core.sh::_exec_sql`: den blanken
`kubectl exec ... psql ... <<<"$sql"`-Befehl gefolgt von `local rc=$?` durch
`local rc=0; kubectl exec ... <<<"$sql" || rc=$?` ersetzen. Der `||`-Zweig
verhindert, dass ein fehlschlagender `kubectl exec`/psql-Aufruf `errexit`
auslöst, bevor der bestehende `[[ -s "$stderr_tmp" ]]`-Ausgabeblock und das
`rm -f "$stderr_tmp"`-Cleanup laufen. Kein Verhalten des Erfolgspfads ändert
sich (rc bleibt 0, wenn kubectl exec erfolgreich ist).

Nach dem Fix beide Tests grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats
```

Zusätzlich Regressionscheck auf dem Nachbar-Guard, der denselben Codepfad
(devmesh-Write-Refuse in `_exec_sql`) abdeckt:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/ticket-devmesh-guard.bats
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Siehe Task 1.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats
# expected: FAIL
```

- [x] **Fix-Step (GREEN).** Siehe Task 2.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
