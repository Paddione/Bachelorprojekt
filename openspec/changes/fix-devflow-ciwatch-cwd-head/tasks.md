---
title: "fix-devflow-ciwatch-cwd-head — Implementation Plan"
ticket_id: T003612
domains: [scripts]
status: active
file_locks:
  - scripts/devflow-ci-watch.sh
  - tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-devflow-ciwatch-cwd-head — Implementation Plan

_Ticket: T003612_

## File Structure

```
scripts/devflow-ci-watch.sh                     ← three-line fix (Z.74, Z.90, Z.96)
tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats ← two new RED tests (T003612-a, T003612-b)
openspec/changes/fix-devflow-ciwatch-cwd-head/  ← this plan
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the new T003612 tests. Both must FAIL on the
      current branch — the bugs are not yet fixed.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats --filter 'T003612'
# expected: FAIL (red — both bugs are still present)
```

- [ ] **Fix-Step (GREEN).** Three targeted changes in `scripts/devflow-ci-watch.sh`:

  1. **Line 74** — add `"$PR_URL"` to the `gh pr checks` call:
     ```bash
     gh pr checks "$PR_URL" --watch --interval 15 2>/dev/null || true
     ```

  2. **Line 90** — replace `$(git rev-parse HEAD)` with the PR's headRefOid:
     ```bash
     PR_HEAD_OID=$(gh pr view "$PR_URL" --json headRefOid -q '.headRefOid' 2>/dev/null || echo "")
     TOTAL_CHECKS=$(gh api "repos/Paddione/Bachelorprojekt/commits/${PR_HEAD_OID}/check-runs" -q '.total_count' 2>/dev/null || echo "0")
     ```

  3. **Before line 96** — add pending-check detection before the green path:
     ```bash
     PENDING_COUNT=$(gh pr view "$PR_URL" --json statusCheckRollup \
       -q '[.statusCheckRollup[] | select(.status != "COMPLETED")] | length' 2>/dev/null || echo "0")
     if [[ "$PENDING_COUNT" -gt 0 ]]; then
       if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
         echo "❌ Nach $MAX_CI_ATTEMPTS Versuchen noch $PENDING_COUNT Checks nicht abgeschlossen — manuelles Eingreifen nötig." >&2
         exit 1
       fi
       echo "⏳ $PENDING_COUNT Checks noch nicht abgeschlossen — warte ..."
       sleep 30
       continue
     fi
     ```

  After applying these changes, re-run the RED tests — both must now pass (GREEN).

- [ ] **Final Verification.** Run the three mandatory CI gates plus full BATS suite:

```bash
task test:changed
task freshness:regenerate
task freshness:check

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats
# All 4 tests must pass: 2 T002671 + 2 T003612
```
