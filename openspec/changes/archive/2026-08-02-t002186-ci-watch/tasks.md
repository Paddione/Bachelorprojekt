---
title: "t002186-ci-watch — Implementation Plan"
ticket_id: T002186
domains: [ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002186-ci-watch — Implementation Plan

## File Structure

```
scripts/devflow-ci-watch.sh                    (changed — zero-check guard + count-aware message)
tests/spec/ci-cd.bats                          (changed — BATS tests for 0-checks case)
```

## Partial Plans

### PP1: Zero-check guard + count-aware message

**File:** `scripts/devflow-ci-watch.sh`

Changes:
1. Before the `[[ -z "$FAILED_CHECKS" ]]` check on line 70, query the total check-run count:
   ```bash
   TOTAL_CHECKS=$(gh api "repos/Paddione/Bachelorprojekt/commits/$(git rev-parse HEAD)/check-runs" -q '.total_count' 2>/dev/null || echo "0")
   ```
2. If `TOTAL_CHECKS -eq 0`, exit with code 5 and message:
   `"⚠ Keine CI-Checks gefunden (total_count=0) — CI wurde nie gestartet oder läuft noch."`
3. Change success message from `"✅ Alle CI-Checks grün."` to
   `"✅ $TOTAL_CHECKS CI-Checks, alle grün."`

### PP2: BATS regression test

**File:** `tests/spec/ci-cd.bats`

Add test case:
```bash
@test "devflow-ci-watch: 0 check-runs exits with code 5" {
  # Mock: simulate zero check-runs
  run scripts/devflow-ci-watch.sh T002186 "http://example.com/pr/1"
  [ "$status" -eq 5 ]
  [[ "$output" =~ "Keine CI-Checks" ]]
}
```

Note: The test will need appropriate gh CLI mocking since `devflow-ci-watch.sh` calls
`gh` extensively. Use existing BATS mock patterns from the repo.
