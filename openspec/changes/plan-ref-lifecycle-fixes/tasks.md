---
title: Plan-Ref Lifecycle Fixes
ticket_id: T002044
domains: [ticket-system, devflow]
status: planning
---

# plan-ref-lifecycle-fixes — Implementation Plan

## File Structure

```
openspec/changes/plan-ref-lifecycle-fixes/
├── proposal.md
├── tasks.md
├── .ticket              ← T002044
├── specs/
│   └── plan-ref-lifecycle-fixes.md
└── (test files in tests/unit/scripts/)
```

## Task 1: Pre-flight validation in dev-flow-execute

**Target files:** `skills/dev-flow-execute/SKILL.md`

Add a validation step at the start of the execute flow that checks whether the FACTORY-PLAN-REF's referenced file exists in git:

```bash
# In the execute flow, before proceeding:
PLAN_FILE=$(ticket.sh get --id "$TICKET_ID" --field plan_ref 2>/dev/null | jq -r '.file // empty')
if [[ -n "$PLAN_FILE" ]]; then
  if ! git cat-file -e "HEAD:$PLAN_FILE" 2>/dev/null; then
    echo "ERROR: Plan file '$PLAN_FILE' referenced in FACTORY-PLAN-REF does not exist in git."
    echo "Re-run dev-flow-plan for this ticket to generate a valid plan."
    exit 1
  fi
fi
```

**Verify:**
- Manually set a FACTORY-PLAN-REF to a nonexistent path → execute should fail with clear error
- Set a valid FACTORY-PLAN-REF → execute should proceed normally

## Task 2: Superseding FACTORY-PLAN-REF pattern

**Target files:** `scripts/vda/ticket/stage-plan.sh`

Replace the NOT EXISTS guard with an INSERT that always adds a new comment. The most recent FACTORY-PLAN-REF comment is the authoritative one:

```bash
# Before (broken):
# INSERT INTO ticket_comments ... WHERE NOT EXISTS (... LIKE 'FACTORY-PLAN-REF %')

# After (superseding):
# Always INSERT — most recent comment wins
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'ticket-ops',
       'FACTORY-PLAN-REF branch=' || :branch || ' plan=' || :plan,
       'internal'
  FROM tickets.tickets WHERE external_id = :ext_id;
```

Also add a log message: `echo "FACTORY-PLAN-REF updated (superseding any previous ref)"`.

**Verify:**
- Run `stage-plan` twice with different plan paths → second comment should be the active one
- Old comment should remain in history

## Task 3: Document specs/ delta dir in dev-flow-execute

**Target files:** `skills/dev-flow-execute/SKILL.md`

Add documentation that the plan-staging step must include:
- `openspec/changes/<slug>/specs/*.md` — delta spec files with `## ADDED/MODIFIED Requirements`
- `openspec/changes/<slug>/.ticket` — ticket reference file

These are required by `task test:openspec` (scripts/openspec-validate.test.ts).

## Task 4: Failing test — plan-ref pre-flight validation

**Target files:** `tests/unit/scripts/stage-plan.bats` (or new test file)

Write a BATS test that verifies the pre-flight check catches a missing plan file:

```bash
@test "stage-plan rejects FACTORY-PLAN-REF pointing to nonexistent file" {
  # Setup: create a ticket with a FACTORY-PLAN-REF to a file that doesn't exist
  run bash scripts/vda/ticket/stage-plan.sh --id T000999 --branch "feature/test" --plan "openspec/changes/nonexistent/tasks.md"
  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]   # expected: FAIL (before fix) → output matches error
}
```

This test **expected: FAIL** before the fix is applied — the current code silently succeeds.
After Task 1 (pre-flight validation), this test should pass.

## Task 5: Verify

Run `task test:changed` to confirm no regressions.
Run `task freshness:regenerate && task freshness:check` to ensure generated artifacts are committed.
