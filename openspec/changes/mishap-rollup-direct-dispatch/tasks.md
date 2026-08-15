---
title: "mishap-rollup-direct-dispatch — Implementation Plan"
ticket_id: T007056
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-direct-dispatch — Implementation Plan

_Ticket: T007056_

## File Structure

```
scripts/ticket.sh                                    (cmd_rollup_container: Collect-Mode-Filter + Description)
scripts/factory/mishap-rollup.sh                     (stage-plan-Block statt Container-Closure)
tests/spec/mishap-rollup/rollup-direct-dispatch.bats (neu: Regressionstests)
tests/spec/mishap-rollup/container-resolution-real-db.bats (Filter-Szenarien anpassen, falls gepinnt)
.agents/skills/mishap-tracker/SKILL.md               (§3.5 Wording: Staged-Lane statt PR-Merge)
website/src/data/openspec-status.json                (freshness:regenerate)
docs/code-quality/repo-index.json                    (freshness:regenerate)
```

## Task 1 — RED: BATS-Test für Staged-Lane-Dispatch statt Container-Closure

- [ ] **Failing-Test-Step (RED).** Neue Datei `tests/spec/mishap-rollup/rollup-direct-dispatch.bats`:
  1. Generator-Statement: `mishap-rollup.sh` enthält den `stage-plan --no-hold`-Aufruf und
     KEINEN `update-status --status done`-Aufruf mehr.
  2. Finder-Statement: `rollup-container`-Suchfilter matcht `status IN
     ('triage','backlog','planning')` und schließt `plan_staged` aus; ein `blocked`-Container
     ohne FACTORY-PLAN-REF bleibt auffindbar.
  3. Description-Statement: frische Container-Beschreibung nennt `resolution=fixed` nach
     Executor-Merge statt Generator-Closure.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-direct-dispatch.bats
# expected: FAIL (red — der Dispatch-Umbau ist noch nicht implementiert)
```

## Task 2 — GREEN: Generator-Umbau

- [ ] `scripts/factory/mishap-rollup.sh`: Block „Container schließen (done/obsolete)" ersetzen
      durch `ticket.sh stage-plan --id "$CONTAINER_ID" --branch "$BRANCH" --plan
      "$CHANGE_DIR/tasks.md" --no-hold` (nach erfolgreichem `rollup-publish.sh`). Header-Kommentar
      anpassen (Zyklus endet mit Staging, nicht mit Closure).
- [ ] `scripts/ticket.sh cmd_rollup_container`: Suchfilter auf Collect-Mode
      (`triage`/`backlog`/`planning` + `blocked` ohne FACTORY-PLAN-REF); Container-Description
      auf den neuen Lifecycle (Closure `done/fixed` nach Executor-Merge).
- [ ] `.agents/skills/mishap-tracker/SKILL.md` §3.5: „per PR auf main gemergt und dort archiviert"
      → „per stage-plan in die Factory-Lane, Archivierung durch den Executor-Finalizer".
- [ ] Bestehende mishap-rollup-Spec-Tests, die den alten Closure-/PR-Weg pinnen, auf die neue
      Semantik umstellen.

## Task 3 — Verifikation

- [ ] Der RED-Test aus Task 1 ist jetzt grün.
- [ ] `task test:changed` (mishap-rollup-Suite + factory-queue-Staged-Lane-Tests).
- [ ] `task freshness:regenerate && task freshness:check` — openspec-status.json,
      test-inventory.json und repo-index.json committen.

## Verify (RED → GREEN)

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
