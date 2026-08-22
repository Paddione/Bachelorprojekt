---
title: "dev-flow-lifecycle-contract — Implementation Plan"
ticket_id: T013482
domains: [plan-authoring, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-flow-lifecycle-contract — Implementation Plan

_Ticket: T013482_ · _Design: `openspec/changes/dev-flow-lifecycle-contract/design.md`_

## File Structure

```text
.claude/skills/references/dev-flow-lifecycle.md       new shared transition/ownership SSOT
.agents/skills/references/dev-flow-lifecycle.md       hardlink mirror of the shared SSOT
.agents/skills/OVERVIEW.md                            concise lifecycle map and role ladder
.claude/skills/dev-flow-plan/SKILL.md                 entry/handoff aligned to shared contract
.agents/skills/dev-flow-plan/SKILL.md                 hardlink mirror
.claude/skills/dev-flow-chore/SKILL.md                common short lifecycle + E2E handoff
.agents/skills/dev-flow-chore/SKILL.md                hardlink mirror
.claude/skills/references/dev-flow-gotchas.md         moved incident rationale
.agents/skills/references/dev-flow-gotchas.md         hardlink mirror
.claude/skills/dev-flow-execute/SKILL.md              role swimlanes and corrected gate order
.agents/skills/dev-flow-execute/SKILL.md              hardlink mirror
.claude/skills/references/dev-flow-execute-phases.md  mechanics aligned to the gate order
.agents/skills/references/dev-flow-execute-phases.md  hardlink mirror
.claude/skills/references/ci-fix-loop.md               until-MERGED late failure/conflict loop
.agents/skills/references/ci-fix-loop.md               hardlink mirror
.claude/skills/dev-flow-e2e/SKILL.md                   specialized test-only Chore lifecycle
.agents/skills/dev-flow-e2e/SKILL.md                   hardlink mirror
tests/spec/agent-skills/dev-flow-lifecycle-contract.bats new cross-skill contract guards
tests/spec/dev-flow-e2e.bats                           migrate feature-branch assertions
tests/spec/ci-cd.bats                                  gate-order assertion update
tests/spec/agent-skills/review-gate-before-auto-merge.bats ordering regression
tests/spec/ci-cd/devflow-execute-hardening-t002365.bats role/late-CI regression
components/website/src/data/test-inventory.json        regenerated test inventory
```

The agent-skill and Claude-skill mirror pairs are hardlinks in a normal checkout. They are listed
explicitly because Git tracks both paths; edit through one path, then prove byte parity before
commit. Markdown files are outside the configured S1 extension limits; no baseline key is added.
The new BATS file stays small and focused; existing BATS files are extended where they already
own the exact invariant.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-lifecycle-contract.md | impl | .claude/skills/references/dev-flow-lifecycle.md, .agents/skills/references/dev-flow-lifecycle.md, .agents/skills/OVERVIEW.md | |
| p2 | tasks.d/p2-plan-chore.md | impl | .claude/skills/dev-flow-plan/SKILL.md, .agents/skills/dev-flow-plan/SKILL.md, .claude/skills/dev-flow-chore/SKILL.md, .agents/skills/dev-flow-chore/SKILL.md, .claude/skills/references/dev-flow-gotchas.md, .agents/skills/references/dev-flow-gotchas.md | p1 |
| p3 | tasks.d/p3-execute-e2e.md | impl | .claude/skills/dev-flow-execute/SKILL.md, .agents/skills/dev-flow-execute/SKILL.md, .claude/skills/references/dev-flow-execute-phases.md, .agents/skills/references/dev-flow-execute-phases.md, .claude/skills/references/ci-fix-loop.md, .agents/skills/references/ci-fix-loop.md, .claude/skills/dev-flow-e2e/SKILL.md, .agents/skills/dev-flow-e2e/SKILL.md | p1 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/agent-skills/dev-flow-lifecycle-contract.bats, tests/spec/dev-flow-e2e.bats, tests/spec/ci-cd.bats, tests/spec/agent-skills/review-gate-before-auto-merge.bats, tests/spec/ci-cd/devflow-execute-hardening-t002365.bats, components/website/src/data/test-inventory.json | p1, p2, p3 |

## Execution order and gates

- [ ] **RED — encode the new lifecycle before rewriting prose.** Add the cross-skill BATS
  assertions and invert the existing E2E `feature/*` expectation to ticketed `chore/*`.
  Assert that `assert-phase-chain` occurs before `gh pr merge --auto`, that the CI/conflict
  loop remains active until `MERGED`, and that a corrective push re-enters invalidated gates.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agent-skills/dev-flow-lifecycle-contract.bats \
  tests/spec/dev-flow-e2e.bats \
  tests/spec/agent-skills/review-gate-before-auto-merge.bats \
  tests/spec/ci-cd/devflow-execute-hardening-t002365.bats
# expected: FAIL — current E2E branch contract is feature/* and Execute places the phase gate after auto-merge
```

- [ ] **GREEN — implement p1–p3.** Introduce the transition SSOT, slim the four skills, and
  preserve all existing literal guard anchors unless p4 intentionally migrates their owning
  regression test. Do not weaken git-crypt, worktree, SID, review, Freshness, merge-wait or
  finalizer idempotency contracts.

- [ ] **Late CI/conflict loop proof.** Cover a later required check turning red,
  `DIRTY`/`CONFLICTING` after `main` advances, replacement checks after an Implementer push,
  re-review of the new commit, repeated phase-chain assertion, and Finalizer refusal to close
  before `state=MERGED`.

- [ ] **Mirror and legacy-guard audit.** Enumerate every BATS file that reads the four skills,
  run that complete set, and verify every corresponding mirror pair with `cmp -s`.

- [ ] **Final Verification.** Regenerate inventory after the new BATS file, stage generated
  artifacts, then run the mandatory gates:

```bash
task test:changed
task test:spec:changed
task freshness:regenerate
task freshness:check
```
