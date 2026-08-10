---
title: "fix-update-status-planstaged-guard-T002876 — Implementation Plan"
ticket_id: T002876
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-update-status-planstaged-guard-T002876 — Implementation Plan

_Ticket: T002876_

## File Structure

```
scripts/vda/ticket/update-status.sh   (modify — plan_staged guard before UPDATE)
tests/spec/ticket-system.bats         (modify — add guard tests)
openspec/specs/tickets.md             (modify — ADDED Requirements merged via archive)
```

## Tasks

### Task 1: Failing-Test (RED)

Add static-grep tests to `tests/spec/ticket-system.bats` (next to the
T002382-M2 guard tests, ~line 452):

1. `update-status.sh guards plan_staged without a FACTORY-PLAN-REF comment`
   — grep for an error message naming `plan_staged` and the missing plan reference.
2. `update-status.sh plan_staged guard queries ticket_comments for FACTORY-PLAN-REF`
   — grep for a SQL/comment lookup on `ticket_comments` with `FACTORY-PLAN-REF`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL (red — the guard is not yet implemented)
```

### Task 2: Fix (GREEN)

In `scripts/vda/ticket/update-status.sh`, after the T002382 terminal-guard
case block and before the UPDATE:

- if `status == plan_staged`: run a SELECT checking for a `ticket_comments`
  row whose `body LIKE 'FACTORY-PLAN-REF %'` for this ticket.
- no row → `echo "ERROR: Cannot transition to 'plan_staged' without a FACTORY-PLAN-REF comment — stage the plan first (stage-plan)."` + exit 2.

Note: `reconcile-ticket-status.sh` writes SQL directly and never calls this
script, so the watchdog path stays unblocked (documented in the script).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: PASS (green — guard present)
```

### Task 3: Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
