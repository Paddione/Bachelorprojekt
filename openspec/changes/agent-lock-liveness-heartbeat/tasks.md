---
title: "agent-lock-liveness-heartbeat — Implementation Plan"
ticket_id: T015822
domains: [repo-infra]
status: active
file_locks: ["scripts/agent-lock.sh", "scripts/agent-lock-guards.sh", "tests/spec/agent-lock-liveness-heartbeat.bats"]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-liveness-heartbeat — Implementation Plan

_Ticket: T015822_

## File Structure

```
scripts/agent-lock.sh                        # _touch_heartbeat + Aktivitätscheck in pid/sid-dead-Pfaden (_reapable)
scripts/agent-lock-guards.sh                 # Herzschlag-Aufrufe in cmd_guard_precommit/cmd_guard_postcheckout
tests/spec/agent-lock-liveness-heartbeat.bats # neu
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# tests/spec/agent-lock-liveness-heartbeat.bats:
#  T1: alter Heartbeat + tote owner_pid + AKTIVER /proc-cwd-Prozess im Worktree
#      => reap/list behält Lock (heute: wird als pid-dead geerntet)
#  T2: gleiche Lage OHNE Prozess => Lock wird geerntet (pid-dead, Regression)
#  T3: guard-precommit in Worktree mit Lock erneuert heartbeat_at
#  T4: fehlender Store => Guard exit 0 (fail-open)
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-liveness-heartbeat.bats
# expected: FAIL (red)
```

- [x] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.
      - `_touch_heartbeat` in agent-lock.sh (atomar via bestehendem
        `_with_lock`-flock-Stil); Guards rufen es für passende Einträge.
      - `_reapable`: in pid-dead (:239–244) und sid-dead (:260–269) vor dem
        Reap-Entscheid `_worktree_has_active_process` auswerten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-liveness-heartbeat.bats
# expected: PASS
```

- [x] **Regression.** Bestehende Lock-Specs bleiben grün:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agent-lock-claim-persist.bats \
  tests/spec/scripts/agent-lock-stale-holder.bats \
  tests/spec/factory-reclaim-lock-respect/pid-dead-worktree-match-T002849.bats \
  tests/spec/active-sessions-hub/
```

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
