#!/usr/bin/env bats
# tests/spec/t001408-mishap-bundle.bats
# SSOT: openspec/changes/t001408-mishap-bundle/proposal.md
# T001408 — Mishap-Bundle: agent-lock, skills/dev-flow-execute,
# scripts/devflow-ci-watch.sh (3 Einträge).
#
# Consolidates the failing-test contract for all three mishaps in the bundle.
# Each test must FAIL on the current `fix/t001408-mishap-bundle-agent-lock`
# branch and PASS after the corresponding fix lands. Design note lives in
# git history (docs/superpowers/specs/2026-07-01-t001408-mishap-bundle-design.md,
# removed in doc cleanup T001869).
#
#   M1 — scripts/agent-lock.sh: grace-period + reap diagnostics so a young
#        claim isn't reaped on a single unverifiable numeric-SID check
#   M2 — scripts/devflow-ci-watch.sh: mergeStateStatus/DIRTY preflight
#        rebase before the implementer hangs in the CI-poll loop
#   M3 — scripts/devflow-ci-watch.sh: `gh pr checks --json ...` is an
#        invalid flag and must be replaced by a working structured query

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  CI_WATCH="$REPO/scripts/devflow-ci-watch.sh"
}

# ── Mishap 1: agent-lock false-positive reap ────────────────────────────#
#
# _reapable() must not drop a freshly created claim solely because the
# numeric-SID fallback check (_sid_alive with a purely numeric SID) reports
# it dead — a grace period must protect claims younger than
# AGENT_LOCK_GRACE seconds. The heartbeat-TTL path remains the ultimate
# fallback for genuinely dead sessions (unchanged, unaffected by this test).

@test "T001408-M1: agent-lock.sh defines an AGENT_LOCK_GRACE window" {
  grep -Eq 'AGENT_LOCK_GRACE' "$LOCK"
}

@test "T001408-M1: agent-lock does not reap a claim younger than the grace period on a dead numeric SID alone" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  unset CLAUDE_SESSION_ID
  # A numeric SID that cannot be pgrep-verified (i.e. "dead") but the claim
  # itself was just created — must survive the grace window.
  AGENT_LOCK_SID="999999" bash "$LOCK" claim ticket t001408-m1-grace --label mishap1
  # Immediately reap — the claim must survive because it is younger than
  # AGENT_LOCK_GRACE, even though its numeric SID is not verifiable as
  # alive from this shell (pgrep -s 999999 finds nothing).
  bash "$LOCK" reap
  run bash "$LOCK" list
  [[ "$output" == *"t001408-m1-grace"* ]]
  rm -rf "$AGENT_LOCK_DIR"
}

@test "T001408-M1: agent-lock logs a reap reason when a claim is actually reaped" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  AGENT_LOCK_TTL=1 AGENT_LOCK_SID="888888" bash "$LOCK" claim ticket t001408-m1-log --label mishap1
  sleep 2
  AGENT_LOCK_TTL=1 bash "$LOCK" reap
  [ -f "$AGENT_LOCK_DIR/.reap.log" ]
  grep -q "t001408-m1-log" "$AGENT_LOCK_DIR/.reap.log"
  rm -rf "$AGENT_LOCK_DIR"
}

# ── Mishap 2: dev-flow-execute hangs in CI-poll loop despite DIRTY ──────#
#
# devflow-ci-watch.sh must check mergeStateStatus BEFORE entering the CI
# polling loop, and self-service a rebase against main on DIRTY, instead of
# only relying on the much-later Schritt 6.4 check (which runs after
# auto-merge is already requested).

@test "T001408-M2: devflow-ci-watch.sh checks mergeStateStatus before the CI poll loop" {
  grep -Eq 'mergeStateStatus' "$CI_WATCH"
}

@test "T001408-M2: devflow-ci-watch.sh attempts a rebase against main on DIRTY mergeStateStatus" {
  grep -Eq 'rebase[[:space:]]+origin/main|rebase[[:space:]]+origin main' "$CI_WATCH"
}

# ── Mishap 3: gh pr checks --json is an invalid flag ────────────────────#
#
# `gh pr checks` has no --json flag (verified via `gh pr checks --help`);
# the script must use a working structured-check query instead
# (e.g. `gh pr view --json statusCheckRollup`).

@test "T001408-M3: devflow-ci-watch.sh does not call the invalid 'gh pr checks --json' flag" {
  ! grep -Eq 'gh pr checks[[:space:]]+.*--json' "$CI_WATCH"
}

@test "T001408-M3: devflow-ci-watch.sh derives failed checks from 'gh pr view --json statusCheckRollup'" {
  grep -Eq 'gh pr view.*--json[[:space:]]+.*statusCheckRollup' "$CI_WATCH"
}
