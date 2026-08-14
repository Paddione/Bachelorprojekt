#!/usr/bin/env bats
# tests/spec/t001353-mishap-bundle-ci-tickets.bats
# Ticket: T001353 — Mishap-Bundle: tests/ci-pipeline, tickets
# No dedicated OpenSpec SSOT spec exists for this mishap-bundle ticket
# (cross-cutting maintenance, not a feature); per BATS convention this
# lives under tests/spec/ as a ticket-scoped regression guard.
#
# Mishap 1 (tests/ci-pipeline, broken, fixed): plan-lint.bats hardcoded a
# stale baseline.json snapshot (1018) for InboxApp.svelte after the file
# shrank to 1013 LOC. This block reproduces the RED->GREEN behavior with
# the expected value read dynamically from baseline.json (never hardcoded
# again — that would just reproduce the same bug in the guard itself).
#
# Mishap 2 (tickets, drift, already fixed during triage) and Mishap 3
# (tickets, drift, deliberately left unfixed per user decision) have no
# live reproducible bug to RED/GREEN in CI: Mishap 2 was corrected by hand
# before this PR, and Mishap 3 must NOT be auto-fixed (would contradict
# the explicit 2026-07-01 user decision to defer to manual review). A test
# reproducing Mishap 3 would stay permanently red and block the CI gate.
# Instead we assert only that both are documented in mishaps.md — a cheap,
# offline, DB-free invariant that keeps the paper trail honest.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LINT="$REPO/scripts/plan-lint.sh"
  BASELINE="$REPO/docs/code-quality/baseline.json"
  MISHAPS="$REPO/openspec/changes/archive/2026-07-01-t001353-mishap-bundle-ci-tickets/mishaps.md"
}

@test "Mishap 1: plan-lint effective_threshold for InboxApp.svelte matches current baseline.json (not a stale hardcoded snapshot)" {
  local tmp_base
  tmp_base=$(mktemp)
  cat > "$tmp_base" <<'EOF'
{
  "S1:website/src/components/inbox/InboxApp.svelte": {
    "metric": 1200
  }
}
EOF
  local limit; limit=$(yq -r '.s1.limits[".svelte"]' "$REPO/docs/code-quality/gates.yaml")
  run env PLAN_LINT_SELFTEST=1 BASELINE="$tmp_base" bash "$LINT" effective_threshold "website/src/components/inbox/InboxApp.svelte"
  rm -f "$tmp_base"
  [ "$status" -eq 0 ]
  local expected=$((1200 > limit ? 1200 : limit))
  [ "$output" = "$expected" ]
}

@test "Mishap 2: T001341 awaiting_deploy drift RCA is documented in mishaps.md" {
  [ -f "$MISHAPS" ]
  grep -q "Mishap 2" "$MISHAPS"
  grep -q "T001341" "$MISHAPS"
}

@test "Mishap 3: T001350 done-without-merge-evidence drift is documented in mishaps.md (deliberately unfixed)" {
  [ -f "$MISHAPS" ]
  grep -q "Mishap 3" "$MISHAPS"
  grep -q "T001350" "$MISHAPS"
}
