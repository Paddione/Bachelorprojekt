---
ticket_id: T000785
plan_ref: null
created: 2026-06-15
status: active
branch: fix/t000785-ci-checks-blocked
domains: [website]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: CI freshness check ohne Auto-Push auf PR-Branches

## Summary

Entferne den Auto-Commit+Push für stale freshness artifacts aus dem PR-CI-Job.
Stattdessen: `freshness:check` schlägt fehl → Entwickler fixt manuell.

## Files to change

| File | Action | S1 budget vs. threshold |
|---|---|---|
| `.github/workflows/ci.yml` | Edit | 89 lines removed, 5 added. Threshold 500 → net -84 (well under) |

## Steps

### 1. Remove auto-push logic from ci.yml offline-tests job

**File:** `.github/workflows/ci.yml`, lines 77–111

Replace the "Ensure freshness artifacts are up to date" step (which regenerates + auto-pushes)
with a simple `freshness:check` step that tells the developer what to do on failure:

```yaml
      - name: Ensure freshness artifacts are up to date
        if: github.event_name == 'pull_request'
        run: |
          if ! task freshness:check; then
            echo ""
            echo "❌ Freshness artifacts are stale."
            echo "   Run locally:  task freshness:regenerate"
            echo "   Then commit and push the regenerated files."
            exit 1
          fi
          echo "✅ Freshness artifacts are up to date"
```

**Remove:**
- Lines 79–81: `env:` block with `GH_TOKEN` and `HEAD_REF`
- Lines 83–88: HEAD_REF validation
- Line 89: `task freshness:regenerate`
- Lines 90–106: git diff, auto-commit, push logic
- Lines 110–112: Fall-through comments

**Keep:**
- The step condition `if: github.event_name == 'pull_request'`
- The step name
- The existing `freshness:check` step at lines 113–114 (redundant after change, remove it)

Wait — after replacing the regenerate+push step with a check that exits 1 on failure,
the old "Verify generated artifacts are fresh" step at lines 113–114 becomes redundant.
Remove it too.

### 2. Remove redundant freshness:check step

Lines 113–114 currently run `task freshness:check` unconditionally. After step 1,
the check is already done in the PR step. Remove these lines:

```yaml
# REMOVE:
      - name: Verify generated artifacts are fresh
        run: task freshness:check
```

### 3. Verify freshness-regen.yml is unchanged

`freshness-regen.yml` (push on main) remains as-is — it catches stale artifacts that slip
through on main and auto-commits them. No changes needed.

## Verification

```bash
# After changes, on the PR branch:
task freshness:regenerate   # ensure artifacts are fresh locally
git add -A && git commit -m "chore: regenerate freshness artifacts"
# Push → CI should pass freshness:check
# The PR statusCheckRollup should populate with all 5 checks
```

### CI-equivalent check
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
