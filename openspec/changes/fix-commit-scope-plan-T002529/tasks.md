---
title: "fix-commit-scope-plan-T002529 — Implementation Plan"
ticket_id: T002529
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-commit-scope-plan-T002529 — Implementation Plan

_Ticket: T002529_

## File Structure

```
scripts/check-commit-vs-diff.sh                          # (fix) chore(plan) → chore(plans)
tests/spec/ci-cd.bats                                    # (add) guard test
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Guard-Test prüft dass scope-Empfehlungen
      aus check-commit-vs-diff.sh in der validate-commit-msg.sh-Allowlist sind.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002529"
# expected: FAIL (red — check-commit-vs-diff.sh empfiehlt noch chore(plan):)
```

- [ ] **Step 1: Scope fixen.** In `scripts/check-commit-vs-diff.sh` beide
      Vorkommen von `chore(plan):` auf `chore(plans):` ändern.

- [ ] **Fix-Step (GREEN).** Guard-Test muss jetzt passen.

- [ ] **Final Verification.**

```bash
task test:changed
task freshness:check
```
