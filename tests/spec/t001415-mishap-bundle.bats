#!/usr/bin/env bats
# tests/spec/t001415-mishap-bundle.bats
# SSOT: openspec/changes/t001415-mishap-bundle-status-lifecycle/proposal.md
# T001415 — Mishap-Bundle: worktree-lifecycle/agent-lock.sh,
# dev-flow-execute/ci, tickets/status-lifecycle (3 Einträge).
#
# Consolidates the failing-test contract for all three mishaps in the bundle.
# Each test must FAIL on the current `fix/t001415-status-lifecycle-bundle`
# branch and PASS after the corresponding fix lands. See
# docs/superpowers/specs/2026-07-01-t001415-mishap-bundle-design.md for the
# design note.
#
#   M1 — scripts/agent-lock.sh: owner_pid reaping so a dead process no
#        longer holds a stale claim once the grace window elapses
#   M2 — scripts/devflow-ci-watch.sh: CONFLICTING-PR preflight that exits
#        4 with a clear "rebase manually" message instead of hanging
#   M3 — scripts/factory/auto-close-merged.sh (new) + wakeup.sh hook:
#        scan merged PRs for [T-NNNNNN] tags and transition tickets to
#        done/fixed|shipped when their status is non-terminal

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  CI_WATCH="$REPO/scripts/devflow-ci-watch.sh"
  WAKEUP="$REPO/scripts/factory/wakeup.sh"
}

# ── Mishap 1: agent-lock reaps a dead owner_pid after the grace window ──#
#
# _reapable() must check the owner_pid recorded in the lock file. If the
# process is gone (kill -0 fails) and the claim is older than
# AGENT_LOCK_GRACE seconds, the claim must be reaped and the reason
# "pid-dead" must be written to .reap.log. The existing reap branches
# (worktree-missing, sid-dead, heartbeat-ttl) must keep their semantics
# unchanged.

@test "T001415-M1: agent-lock.sh records reason 'pid-dead' when the owner process is dead" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  # No CLAUDE_SESSION_ID, harness-stable env unset — use a numeric SID that
  # pgrep cannot find (so sid-dead would also fire). The expected behaviour
  # is that the pid-dead check fires first and writes its reason.
  AGENT_LOCK_SID="777777" \
    bash "$LOCK" claim ticket t001415-m1-pid --label mishap1
  # Overwrite the recorded owner_pid to a guaranteed-dead value (PID 1 is
  # init/kthreadd, but we want something we KNOW is dead — 999999 is in
  # nobody's PID table on a clean system).
  LF="$AGENT_LOCK_DIR/ticket__t001415-m1-pid.json"
  sed -i 's/"owner_pid": "[0-9]*"/"owner_pid": "999999"/' "$LF"
  # [T001582-M1] _reapable() now measures age against heartbeat_at first
  # (falling back to created_at only when heartbeat_at is absent), so a
  # genuinely stale-and-never-refreshed claim must have BOTH timestamps
  # aged to simulate that correctly — otherwise the fresh heartbeat_at left
  # over from `claim` above would make this claim look live.
  sed -i 's/"heartbeat_at": "[0-9]*"/"heartbeat_at": "1"/' "$LF"
  # Force the claim to be older than AGENT_LOCK_GRACE so the grace window
  # does not protect it.
  sed -i 's/"created_at": "[0-9]*"/"created_at": "1"/' "$LF"
  bash "$LOCK" reap
  [ -f "$AGENT_LOCK_DIR/.reap.log" ]
  grep -q "t001415-m1-pid" "$AGENT_LOCK_DIR/.reap.log"
  grep -q "pid-dead" "$AGENT_LOCK_DIR/.reap.log"
  rm -rf "$AGENT_LOCK_DIR"
}

@test "T001415-M1: agent-lock does not reap a claim with a dead PID inside the grace window" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  AGENT_LOCK_SID="666666" \
    bash "$LOCK" claim ticket t001415-m1-young --label mishap1
  LF="$AGENT_LOCK_DIR/ticket__t001415-m1-young.json"
  sed -i 's/"owner_pid": "[0-9]*"/"owner_pid": "999999"/' "$LF"
  bash "$LOCK" reap
  # The claim is fresh (now - created_at < AGENT_LOCK_GRACE=120s), so the
  # pid-dead check must NOT drop it. The list output should still include
  # the ticket id.
  run bash "$LOCK" list
  [[ "$output" == *"t001415-m1-young"* ]]
  rm -rf "$AGENT_LOCK_DIR"
}

# ── Mishap 2: devflow-ci-watch aborts on CONFLICTING PRs ─────────────────#
#
# After the T001408 DIRTY preflight, the watcher must additionally call
# `gh pr view --json mergeable` and exit with code 4 when the response
# reports "CONFLICTING". It must NOT attempt an auto-resolve.
# UNKNOWN (GitHub has not yet evaluated) is treated as "not conflicting"
# and the poll loop proceeds.

@test "T001415-M2: devflow-ci-watch.sh queries mergeable in its preflight" {
  grep -Eq 'gh pr view.*--json[[:space:]]+.*mergeable' "$CI_WATCH"
}

@test "T001415-M2: devflow-ci-watch.sh exits 4 on CONFLICTING mergeable status" {
  grep -Eq 'CONFLICTING|conflict|exit[[:space:]]+4|exit 4' "$CI_WATCH"
}

# ── Mishap 3: factory poll auto-closes tickets whose PR is merged ───────#
#
# The new scripts/factory/auto-close-merged.sh script must:
#  (a) exist and be executable (factory-wakeup.sh hook depends on it)
#  (b) call gh pr list --state merged --limit 30
#  (c) extract [T-NNNNNN] tags from titles and call ticket.sh update-status
#  (d) be wired into wakeup.sh for both brands before the dispatcher tick

@test "T001415-M3: scripts/factory/auto-close-merged.sh exists and is executable" {
  [ -x "$REPO/scripts/factory/auto-close-merged.sh" ]
}

@test "T001415-M3: auto-close-merged.sh lists merged PRs via gh pr list --state merged" {
  [ -f "$REPO/scripts/factory/auto-close-merged.sh" ]
  grep -Eq 'gh[[:space:]]+pr[[:space:]]+list.*--state[[:space:]]+merged' "$REPO/scripts/factory/auto-close-merged.sh"
}

@test "T001415-M3: auto-close-merged.sh extracts [T-NNNNNN] tags from PR titles" {
  [ -f "$REPO/scripts/factory/auto-close-merged.sh" ]
  grep -EqE '\[T[0-9]{6}\]|sed.*T[0-9]\{6\}' "$REPO/scripts/factory/auto-close-merged.sh"
}

@test "T001811: auto-close-merged.sh sed pattern actually extracts the ticket ID (regression)" {
  # T001811: the pattern previously had unescaped capture-group parens
  # ('\[(T...)\]' instead of '\[\(T...\)\]'), which made sed abort with
  # "invalid reference \1" on every PR title — auto-close silently never
  # matched anything for either brand. Run the exact sed line from the
  # script (not a re-typed copy) so a future regression here fails loudly.
  sed_cmd=$(grep -m1 '^\s*ticket=\$(printf' "$REPO/scripts/factory/auto-close-merged.sh" \
    | sed -n "s/.*printf '%s' \"\$title\" | \(sed -n '[^']*'\).*/\1/p")
  [ -n "$sed_cmd" ]

  run bash -c "printf '%s' 'fix(admin): cockpit foo [T001655]' | $sed_cmd | head -1"
  [ "$status" -eq 0 ]
  [ "$output" = "T001655" ]

  run bash -c "printf '%s' 'chore: no ticket tag here' | $sed_cmd | head -1"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "T001415-M3: auto-close-merged.sh transitions non-terminal tickets via ticket.sh update-status" {
  [ -f "$REPO/scripts/factory/auto-close-merged.sh" ]
  grep -Eq 'ticket\.sh[[:space:]]+update-status.*--status[[:space:]]+done' "$REPO/scripts/factory/auto-close-merged.sh"
}

@test "T001415-M3: wakeup.sh invokes auto-close-merged.sh for both brands" {
  grep -Eq 'auto-close-merged\.sh' "$WAKEUP"
  # Both brands must be covered.
  grep -q 'mentolder' "$WAKEUP"
  grep -q 'korczewski' "$WAKEUP"
  # The hook must run before the dispatcher tick (the existing
  # auto-enqueue.sh + auto-triage.sh calls live in the same loop block).
  awk '/while true/,/done$/{print}' "$WAKEUP" | grep -q 'auto-close-merged'
}
