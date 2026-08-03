---
title: "t002105-mishap-bundle — Implementation Plan"
ticket_id: T002105
domains: [repo/tickets/auto-closure, ci/github-actions]
status: active
---

# t002105-mishap-bundle — Implementation Plan

_Ticket: T002105_

## Mishap 1: T002102 auto-closed via merge despite incomplete multi-partial plan

**Problem:** PR #3135 merged and the merge=Abschluss convention auto-closed T002102
as `done`. But the `unified-llm-gateway` OpenSpec plan has 5 partials (p1–p5); PR #3135
only covers p1-proxy-core plus part of p2. The remaining scope is unimplemented.

**Fix:** The auto-closure convention must check whether the staged plan has remaining
unimplemented partials before closing the ticket.

## Mishap 2: PRs #3132 and #3133 stuck BLOCKED with zero CI checks

**Problem:** `gh pr checks` reports no checks on branches for PRs #3132 and #3133.
Both have unpushed local commits ahead of the pushed PR tip.

**Fix:** Re-push the branches to trigger CI runs.

## File Structure

- `scripts/factory/merge-hooks.sh` — add partial-plan guard before auto-close
- `.github/workflows/auto-close.yml` (or equivalent) — reference the guard
- No file changes needed for mishap 2 (just re-push)

## Tasks

### Task 1: Add partial-plan completeness guard to auto-close logic

**File:** `scripts/factory/merge-hooks.sh`

1. Find the auto-close hook/label logic. Search for the merge=closure convention:
   ```bash
   grep -rn "T001092\|auto-close\|auto_close" scripts/ .github/ | head -10
   ```

2. Create `scripts/factory/merge-hooks.sh` with a `check_partial_plan_completeness` function
   that queries the ticket's staged plan and checks if all partial tasks are done.

3. **RED test:** Write a BATS test that expects the guard to block closure when
   partials remain:
   ```bash
   bats tests/spec/factory-merge-hooks.bats
   # expected: FAIL (test doesn't exist yet — red)
   ```

4. Add the guard function and an integration test
   ```bash
   bats tests/spec/factory-merge-hooks.bats
   # expected: PASS after implementing
   ```

### Task 2: Re-push stale PR branches to trigger CI

For PRs #3132 and #3133:

```bash
gh pr view 3132 --json headRefName -q .headRefName | xargs -I{} git push origin {}:{} 2>&1 || echo "Branch needs local push first"
```

Check if CI is now triggered:

```bash
gh pr checks 3132 2>&1 | head -5
gh pr checks 3133 2>&1 | head -5
# expected: at least some checks appearing
```

### Task 3: Run quality gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
