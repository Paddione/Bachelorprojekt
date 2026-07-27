---
title: "queue-dispatch-bug-type — Implementation Plan"
ticket_id: T002333
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# queue-dispatch-bug-type — Implementation Plan

_Ticket: T002333_

`scripts/factory/queue.sh` filtert Dispatch-Kandidaten über `status` **und** `type`.
`type='bug'` kommt in keinem der beiden Zweige vor. Ein Bug-Ticket mit gestagtem,
lint-geprüftem Plan ist dadurch für den Dispatcher strukturell unsichtbar — es bleibt ohne
Fehlermeldung in `plan_staged` liegen. Belegt am 2026-07-27 an T002278, T002321 und
T002335; letzteres hat einen fertigen Worktree und wartet seither.

Der Fix erweitert den bestehenden `plan_staged`-Zweig auf `type IN ('task','bug')`. Ein
dritter OR-Zweig wäre die naheliegende Alternative, ist hier aber falsch: Er müsste die
Readiness-Gates `execution_released` und `factory_excluded` duplizieren — genau die Art
Lücke, die T002361 schließen musste, als ein Gate nur in einem von zwei Zweigen stand.

Nicht in diesem Change: `feature`+`plan_staged` läuft regulär über `auto-enqueue.sh` nach
`backlog` und behält seinen `lastenheft_locked`-Gate (getestet als
"queue.sh gates the autopilot on a locked Lastenheft (fail-closed)").
`project`+`backlog` bleibt ebenfalls außen vor — Epics werden in Kinder zerlegt.

## File Structure

```
scripts/factory/queue.sh                  (geändert — WHERE-Klausel, 1 Zeile + Kommentar)
tests/spec/software-factory.bats          (geändert — 2 neue Tests, 1 Test angepasst)
openspec/changes/queue-dispatch-bug-type/specs/software-factory.md  (neu — Delta-Spec)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die beiden Tests stehen bereits im Stage-Commit
      dieses Branches (`tests/spec/software-factory.bats`, Marker `T002333`). Der erste
      prüft, dass die WHERE-Klausel `type IN ('task','bug')` im `plan_staged`-Zweig führt;
      der zweite, dass es genau **einen** `plan_staged`-Zweig gibt — er schlägt fehl, wenn
      der Fix als dupliziertes OR statt als erweitertes `IN` gebaut wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T002333"
# expected: FAIL (rot — Test 1 scheitert, der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** In `scripts/factory/queue.sh` den zweiten Dispatch-Zweig von
      `type='task'` auf `type IN ('task','bug')` erweitern. Die beiden bestehenden
      `COALESCE(...)`-Gates (`execution_released`, `factory_excluded`) bleiben unverändert
      im selben Zweig stehen — sie gelten damit automatisch auch für Bugs. Den
      Zweig-Kommentar mitziehen, damit er nicht länger nur von "task" spricht.

```sql
      OR (type IN ('task','bug') AND status='plan_staged'
          AND COALESCE((readiness->>'execution_released')::boolean, true) = true
          AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false)
```

- [ ] **Gekoppelten Bestandstest nachziehen.** `FA-SF-52: queue.sh also selects
      plan_staged task tickets` (ca. Zeile 2122) greppt den alten Wortlaut
      `type='task' AND status='plan_staged'` und wird durch den Fix rot. Regex auf
      `type IN \('task','bug'\) AND status='plan_staged'` erweitern und den Testtitel auf
      "task and bug tickets" anpassen — der Titel ist hier Design-Dokumentation und darf
      nicht hinter dem Verhalten zurückbleiben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T002333|FA-SF-52|T002361|T002272-M1"
# expected: PASS (grün — inklusive der beiden Gate-Regressionstests)
```

- [ ] **Wirkung am lebenden System prüfen.** Nach dem Merge muss T002335
      (`type=bug`, `plan_staged`, Priorität hoch) in der Dispatch-Queue auftauchen.

```bash
BRAND=mentolder bash scripts/factory/queue.sh | jq -r '.[].external_id'
# expected: T002335 ist enthalten
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
