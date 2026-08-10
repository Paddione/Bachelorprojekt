#!/usr/bin/env bats
# tests/spec/openspec-workflow/half-archive-uncommitted.bats
# T002824 — the half-archive check must run against a live (uncommitted)
# working tree at commit-time and during session hygiene, not only in
# task:openspec/CI.
#
# Test 1/2: Output-verification — the openspec-half-archive-check.sh script
#            itself (the detection logic from T002428) with OPENSPEC_ROOT
#            pointing to a sandbox.
# Test 3:   Output-verification — agent-lock.sh reap emits an advisory warning.
# Test 4:   Source-grep — the pre-commit hook calls openspec-half-archive-check.sh
#            BEFORE the freshness auto-stage block (ordering matters: the check
#            must run before freshness regen so it catches uncommitted state).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  HALF_ARCHIVE_CHECK="${REPO_ROOT}/scripts/openspec-half-archive-check.sh"
  AGENT_LOCK="${REPO_ROOT}/scripts/agent-lock.sh"
  HOOK="${REPO_ROOT}/.githooks/pre-commit"
  sandbox="${BATS_TEST_TMPDIR}/sandbox"
  mkdir -p "$sandbox"
  cd "$sandbox"
  git init -q -b main
  git config user.email "t@example.com"
  git config user.name "T"
  mkdir -p openspec/changes openspec/specs
  echo "# specs" > openspec/specs/README.md
  git add -A && git commit -qm init
}

_make_half_archive() {
  mkdir -p openspec/changes/dup openspec/changes/archive/2026-01-01-dup
  echo x > openspec/changes/dup/proposal.md
}

@test "T002824: half-archive check detects duplicate slug (positive anchor: clean tree passes first)" {
  # Positive anchor — no half-archive state → exit 0.
  run env OPENSPEC_ROOT="$sandbox/openspec" bash "$HALF_ARCHIVE_CHECK"
  [ "$status" -eq 0 ]

  # Negative case — introduce the half-archive state.
  _make_half_archive
  run env OPENSPEC_ROOT="$sandbox/openspec" bash "$HALF_ARCHIVE_CHECK"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -qF "dup"
}

@test "T002824: half-archive check repariert nichts — das uncommitted-Verzeichnis bleibt bestehen" {
  _make_half_archive
  [ -d openspec/changes/dup ]
  run env OPENSPEC_ROOT="$sandbox/openspec" bash "$HALF_ARCHIVE_CHECK"
  [ "$status" -ne 127 ]  # positive anchor: script exists and runs
  [ -d openspec/changes/dup ]  # still exists — guard only reports
}

@test "T002824: agent-lock.sh reap warns (not fails) on a half-archived slug" {
  _make_half_archive
  mkdir -p "$sandbox/.locks"
  run env AGENT_LOCK_DIR="$sandbox/.locks" OPENSPEC_ROOT="$sandbox/openspec" \
    bash "$AGENT_LOCK" reap
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF "dup"
}

@test "T002824: pre-commit hook calls openspec-half-archive-check.sh before freshness auto-stage" {
  [ -f "$HOOK" ]
  # Positive anchor: the call exists.
  grep -qF 'openspec-half-archive-check.sh' "$HOOK"
  # Ordering: the half-archive guard must appear BEFORE the freshness block.
  guard_line="$(grep -nF 'half-archive' "$HOOK" | head -1 | cut -d: -f1)"
  freshness_line="$(grep -nF '_FRESHNESS_FILES=' "$HOOK" | head -1 | cut -d: -f1)"
  [ -n "$guard_line" ]
  [ -n "$freshness_line" ]
  [ "$guard_line" -lt "$freshness_line" ]
}
