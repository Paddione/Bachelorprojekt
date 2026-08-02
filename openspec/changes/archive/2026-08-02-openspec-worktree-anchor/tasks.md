---
title: "openspec-worktree-anchor — Implementation Plan"
ticket_id: T001997
domains: [infra, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-worktree-anchor — Implementation Plan

_Ticket: T001997_

## File Structure

```
scripts/openspec.sh               (modified — REPO anchored on git rev-parse --show-toplevel)
scripts/openspec-status-map.sh    (modified — same REPO anchor fix)
tests/spec/openspec-worktree-anchor.bats   (new — RED test, already added)
```

## Root Cause (from spec)

Both scripts derive `REPO` from `dirname "${BASH_SOURCE[0]}"` (the physical
invocation path), not from the caller's actual working directory. A wrong
relative invocation path from inside a worktree can silently resolve `REPO`
to the main checkout instead of the worktree (live-observed, T001995
planning).

## Tasks

- [x] **Failing-Test-Step (RED).** `tests/spec/openspec-worktree-anchor.bats`
      already added — asserts both scripts anchor `REPO` via
      `git rev-parse --show-toplevel` and no longer via the
      `dirname "${BASH_SOURCE[0]}"` pattern. Currently FAILS because
      neither script does this yet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-worktree-anchor.bats
# expected: FAIL (red — REPO is still derived from BASH_SOURCE, not cwd)
```

- [ ] **Fix-Step (GREEN).** In `scripts/openspec.sh`, replace:

  ```sh
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO="$(cd "$HERE/.." && pwd)"
  ```

  with:

  ```sh
  REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: openspec.sh must be run from inside a git worktree (cwd is not a git repository)" >&2; exit 1; }
  HERE="$REPO/scripts"
  ```

  Apply the identical replacement in `scripts/openspec-status-map.sh` (same
  two-line pattern, same fix) so the sibling script (invoked by
  `openspec.sh` via `bash "$HERE/openspec-status-map.sh"`) resolves the
  same checkout instead of re-deriving its own `REPO` from its own
  `BASH_SOURCE`. Run
  `tests/unit/lib/bats-core/bin/bats tests/spec/openspec-worktree-anchor.bats`
  again — all three assertions must now pass.

- [ ] **Regression check.** Re-run the existing OpenSpec test suites to
      confirm the fix doesn't change behavior for normal (correct-path)
      invocations:

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/unit/openspec.bats tests/spec/openspec-workflow.bats tests/spec/dev-flow-plan-ticket-sh-mishaps.bats
  ```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
