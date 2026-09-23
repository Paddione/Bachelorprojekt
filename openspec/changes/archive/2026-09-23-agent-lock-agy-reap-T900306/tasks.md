---
title: "agent-lock-agy-reap-T900306 — Implementation Plan"
ticket_id: T900306
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-agy-reap-T900306 — Implementation Plan

_Ticket: T900306_

## File Structure

```
tests/spec/active-sessions-hub/agy-session-id-stable.bats (NEW)
tests/spec/agent-lock-lsp-reap-T900306.bats (NEW)
scripts/agent-lock-identity.sh (MODIFIED)
scripts/agent-lock.sh (MODIFIED)
scripts/hooks/worktree-write-guard.sh (MODIFIED)
scripts/agent-lock-activity.sh (MODIFIED)
scripts/lib/main-checkout-foreign-guard.sh (MODIFIED)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add tests verifying that `ANTIGRAVITY_CONVERSATION_ID` yields a stable SID and detects `agy` tool class, and that `_worktree_has_active_process` ignores passive background language server processes when reaping dead locks.
      expected: FAIL

```bash
npx bats tests/spec/active-sessions-hub/agy-session-id-stable.bats tests/spec/agent-lock-lsp-reap-T900306.bats
# expected: FAIL (red — harness env missing and LSP not filtered)
```

- [ ] **Fix-Step (GREEN).**
  - Add `ANTIGRAVITY_CONVERSATION_ID` to `_AGENT_LOCK_SID_ENVS` across `scripts/agent-lock-identity.sh`, `scripts/agent-lock.sh`, and `scripts/hooks/worktree-write-guard.sh`.
  - Add `agy` tool detection in `_detect_tool()` across `scripts/agent-lock-identity.sh` and `scripts/agent-lock.sh`.
  - Add `agy` recognition to `scripts/lib/main-checkout-foreign-guard.sh`.
  - Add `_is_daemon_or_lsp_process` filter to `_worktree_has_active_process` in `scripts/agent-lock-activity.sh`.
  The tests from the previous step must now pass.

- [ ] **Final Verification.** Run the mandatory test suites and quality gates:

```bash
npx bats tests/spec/active-sessions-hub/*.bats
npx bats tests/spec/agent-lock-liveness-heartbeat.bats
npx bats tests/spec/agent-lock-lsp-reap-T900306.bats
task test:changed
task freshness:regenerate
task freshness:check
```
