---
title: "archive-stage-new-ssot — Implementation Plan"
ticket_id: T900339
domains: [scripts, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-stage-new-ssot — Implementation Plan

_Ticket: T900339_ · Design: `openspec/changes/archive-stage-new-ssot/design.md`

## File Structure

```
NEW:
tests/spec/agent-skills/archive-stage-new-ssot.bats     (RED, bereits committed)

CHANGED:
scripts/lib/archive-staged-scope.sh
scripts/devflow-post-merge-finalize.sh
components/website/src/data/test-inventory.json
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-lib.md | implement | scripts/lib/archive-staged-scope.sh | |
| p2 | tasks.d/p2-finalize.md | implement | scripts/devflow-post-merge-finalize.sh | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/agent-skills/archive-stage-new-ssot.bats, components/website/src/data/test-inventory.json | |

Reihenfolge bei manueller Ausfuehrung: RED-Schritt aus p3, dann p1, p2, dann GREEN und Inventar
aus p3.

Koordination: T900340 (`fix/worktree-remove-managed-T900340`) aendert
`scripts/devflow-post-merge-finalize.sh` ebenfalls (Schritt 10). Die Stellen ueberlappen nicht;
wer zuerst merged, der andere rebased.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die Testdatei liegt bereits auf dem Branch.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/archive-stage-new-ssot.bats
# expected: FAIL (Tests 1, 3, 4, 6 not ok; 2 und 5 ok als Regressionen)
```

- [ ] **Fix-Step (GREEN).** p1 und p2 umsetzen; derselbe Aufruf liefert 6/6 ok.

## Final Verification

- [ ] Neue und angrenzende Tests gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/archive-stage-new-ssot.bats tests/spec/dev-flow-plan/archive-staged-scope.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/
bash -n scripts/lib/archive-staged-scope.sh scripts/devflow-post-merge-finalize.sh
```

- [ ] Mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
