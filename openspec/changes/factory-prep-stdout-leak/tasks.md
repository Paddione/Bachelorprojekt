---
title: "factory-prep-stdout-leak — Implementation Plan"
ticket_id: T003269
domains: [plan-authoring, bachelorprojekt-test]
status: active
file_locks:
  - scripts/vda/factory-prep.sh
  - scripts/factory/wakeup.sh
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-prep-stdout-leak — Implementation Plan

_Ticket: T003269_

## File Structure

```
tests/spec/software-factory/factory-prep-stdout-json.bats   (neu)  RED-Test
scripts/vda/factory-prep.sh                                 (geaendert) D1 + D2
scripts/factory/wakeup.sh                                   (geaendert) D1b
openspec/changes/factory-prep-stdout-leak/                  (neu)  Proposal + Delta
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** BATS-Test, der das echte
      `scripts/vda/factory-prep.sh` in einem Fake-REPO gegen einen
      fehlschlagenden Worktree-Pre-Create ausfuehrt und prueft, dass sein stdout
      fuer sich genommen gueltiges JSON ist. Positiv-Anker im selben Test: der
      unbelegte Fall liefert einen `.launch`-Eintrag.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-prep-stdout-json.bats
# expected: FAIL (red — jq: parse error: Invalid numeric literal at line 1, column 14)
```

- [x] **Fix-Step (GREEN).**
      D1: beide `release-slot`-Aufrufe in `factory-prep.sh` ueber
      `release_slot_and_restore` mit `>/dev/null 2>&1`.
      D1b: `wakeup.sh` meldet den `jq`-Parse-Fehler auf stderr statt ihn zu
      verschlucken; `null`-Fallback bleibt.
      D2: Status-Restore auf `plan_staged` (bzw. `backlog` ohne `plan_ref`) am
      PREP-Aufrufort, nicht im generischen `ticket.sh release-slot`.

- [x] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
