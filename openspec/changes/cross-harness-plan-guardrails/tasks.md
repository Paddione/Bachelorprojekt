---
title: "cross-harness-plan-guardrails — Implementation Plan"
ticket_id: T003267
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cross-harness-plan-guardrails — Implementation Plan

_Ticket: T003267_

## File Structure

```
scripts/plan-preflight.sh                                  (neu)
scripts/vda/ticket/stage-plan.sh                           (geändert)
scripts/plan-lint.sh                                       (geändert)
scripts/factory/pipeline.mjs                               (geändert)
scripts/factory/mishap-rollup.sh                           (geändert)
scripts/factory/auto-chore-plan.sh                         (geändert)
scripts/batch-workflow-gen.sh                              (geändert)
scripts/ticket-mcp/go/internal/tools/workflow.go           (geändert)
docs/agent-guide/registry/plan-guards.yaml                 (neu)
.opencode/skills/opencode-flow-plan/SKILL.md               (geändert)
.claude/skills/dev-flow-plan/SKILL.md                      (geändert)
.claude/skills/references/dev-flow-plan-phases.md          (geändert)
.claude/skills/references/ticket-stage-procedure.md        (geändert)
openspec/changes/cross-harness-plan-guardrails/specs/dev-flow-plan.md  (Delta)
tests/spec/dev-flow-plan/plan-preflight.bats               (neu)
tests/spec/dev-flow-plan/stage-plan-contract.bats          (neu)
tests/spec/dev-flow-plan/plan-lint-rules.bats              (neu)
tests/spec/dev-flow-plan/guard-parity.bats                 (neu)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/cross-harness-plan-guardrails.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
