---
title: "health-goals-remediation — Implementation Plan"
ticket_id: T002148
domains: [ops, db, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# health-goals-remediation — Implementation Plan

_Ticket: T002148_

## File Structure

```
scripts/health-goals-check.sh                          (edit: G-AGENTIC02+G-DB09+G-E2E01 robustness)
.claude/skills/OVERVIEW.md                              (edit: skill counter + gitops-* references)
.claude/skills/gitops-repo-audit/SKILL.md               (edit: 3 script path prefixes)
.claude/skills/dev-flow-plan/SKILL.md                   (edit: trim to <=500 lines)
.claude/skills/dev-flow-plan/references/*.md            (new: extracted content, exact name by author)
.github/workflows/e2e.yml                               (edit: purge-step failure visibility)
openspec/changes/e2e-testdata-leak/ -> openspec/changes/archive/e2e-testdata-leak/  (git mv)
tests/spec/health-goals-remediation.bats                (new)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-health-goals-check-script.md | impl | scripts/health-goals-check.sh | |
| p2 | tasks.d/p2-skill-overview-registry.md | impl | .claude/skills/OVERVIEW.md | |
| p3 | tasks.d/p3-gitops-repo-audit-paths.md | impl | .claude/skills/gitops-repo-audit/SKILL.md | |
| p4 | tasks.d/p4-dev-flow-plan-trim.md | impl | .claude/skills/dev-flow-plan/SKILL.md | |
| p5 | tasks.d/p5-e2e-purge-visibility.md | impl | .github/workflows/e2e.yml | |
| p6 | tasks.d/p6-tests.md | tests | tests/spec/health-goals-remediation.bats | p1,p2,p3,p4,p5 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals-remediation.bats
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
