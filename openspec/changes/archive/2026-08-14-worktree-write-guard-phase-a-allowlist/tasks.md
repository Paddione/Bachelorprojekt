---
title: "worktree-write-guard-phase-a-allowlist — Implementation Plan"
ticket_id: T005559
domains: [scripts, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-write-guard-phase-a-allowlist — Implementation Plan

_Ticket: T005559_

## File Structure

```
scripts/hooks/worktree-write-guard.sh                                  # Add Phase-A path allowlist under main checkout
tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats    # BATS test reproducing failure and verifying fix
```

## 1. Worktree Write Guard Phase-A Allowlist (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add BATS test `tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats` verifying that writes to `$MAIN_ROOT/openspec/changes/*` and `$MAIN_ROOT/.lavish/*` are permitted even when active own worktree claims exist under the same SID. Run with bats:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats
# expected: FAIL (red — guard rejects Phase-A writes on main checkout when own worktrees exist)
```

- [x] **Fix-Step (GREEN).** Update `scripts/hooks/worktree-write-guard.sh` to allow writes to `$MAIN_ROOT/openspec/changes/*` and `$MAIN_ROOT/.lavish/*` when checking own worktree claims.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats
# expected: PASS (green — Phase-A proposal paths permitted on main, non-Phase-A main writes rejected)
```

- [x] **Final Verification.** Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

