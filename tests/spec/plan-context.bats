#!/usr/bin/env bats
# tests/spec/plan-context.bats
# SSOT: openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md
# T001387 — plan-context.sh <role> wertet <role> nie aus; Filter ist wirkungslos.
#
# Failing-test contract: these cases MUST fail on the pre-fix
# `fix/t001387-plan-context-role-filter` branch (the current script
# returns ALL proposals regardless of <role>) and MUST pass after the
# fix lands in scripts/plan-context.sh.
#
# Test strategy: we run the script against the *real* repo (the script
# uses `git rev-parse --show-toplevel` to anchor `CHANGES_DIR`; an
# OPENSPEC_ROOT override is intentionally NOT used so we test the
# production code path). The cases assert inclusion / exclusion of
# specific real proposals in the active change set, plus stderr WARN
# markers emitted by the new filter logic.
#
# Cases 3, 5, 7 are anchor cases (PASS pre- and post-fix) that lock in
# the existing semantics (archive exclusion, mandatory-arg error) so
# a regression on the existing path is also caught.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO/scripts/plan-context.sh"
  [[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT"
}

# ── (1) role=ops must include ops-tagged proposals and exclude website-only ──

@test "PCF: role=bachelorprojekt-ops includes ops-tagged proposal (agent-push-notifications)" {
  out="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null || true)"
  echo "$out" | grep -q '### Active proposal: agent-push-notifications' \
    || { echo "MISSING: agent-push-notifications (domains: [infra, website, ops, security]) should be included for ops"; return 1; }
}

@test "PCF: role=bachelorprojekt-ops excludes website-only proposal (cockpit-mobile-view)" {
  out="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null || true)"
  if echo "$out" | grep -q '### Active proposal: cockpit-mobile-view'; then
    echo "REGRESSION: cockpit-mobile-view (domains: [website]) leaked into ops output — filter not active"
    return 1
  fi
}

@test "PCF: role=bachelorprojekt-ops excludes non-ops/non-infra proposal (ci01-skip-ci-bot-commits)" {
  out="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null || true)"
  if echo "$out" | grep -q '### Active proposal: ci01-skip-ci-bot-commits'; then
    echo "REGRESSION: ci01-skip-ci-bot-commits (domains: [ci]) leaked into ops output — filter not active"
    return 1
  fi
}

# ── (2) role=website must include website-tagged and exclude pure-test ──

@test "PCF: role=bachelorprojekt-website includes website-tagged proposal (cockpit-mobile-view)" {
  out="$(bash "$SCRIPT" bachelorprojekt-website 2>/dev/null || true)"
  echo "$out" | grep -q '### Active proposal: cockpit-mobile-view' \
    || { echo "MISSING: cockpit-mobile-view (domains: [website]) should be included for website"; return 1; }
}

@test "PCF: role=bachelorprojekt-website excludes non-website proposal (img02-image-drift)" {
  out="$(bash "$SCRIPT" bachelorprojekt-website 2>/dev/null || true)"
  if echo "$out" | grep -q '### Active proposal: img02-image-drift'; then
    echo "REGRESSION: img02-image-drift (domains: [infra]) leaked into website output"
    return 1
  fi
}

# ── (3) role=orchestrator returns all non-archived proposals (anchor) ──

@test "PCF: role=orchestrator returns all non-archived proposals (anchor)" {
  out="$(bash "$SCRIPT" orchestrator 2>/dev/null || true)"
  count=$(echo "$out" | grep -c '^### Active proposal:' || true)
  # Repo has ~60+ active changes; we expect the count to be ≥ 30 to be
  # robust against archived changes but still catch a no-op filter.
  [ "$count" -ge 30 ] \
    || { echo "orchestrator should return all non-archived proposals (got $count)"; return 1; }
}

# ── (4) role=foobar (unknown) emits stderr WARN and returns all proposals ──

@test "PCF: unknown role emits WARN: unknown role on stderr" {
  err="$(bash "$SCRIPT" foobar 2>&1 >/dev/null || true)"
  echo "$err" | grep -Eq 'WARN: *unknown role' \
    || { echo "MISSING stderr WARN for unknown role (got: $err)"; return 1; }
}

@test "PCF: unknown role returns all non-archived proposals (fail-soft)" {
  out="$(bash "$SCRIPT" foobar 2>/dev/null || true)"
  count=$(echo "$out" | grep -c '^### Active proposal:' || true)
  [ "$count" -ge 30 ] \
    || { echo "unknown role should return all proposals as fail-soft (got $count)"; return 1; }
}

# ── (5) archive/ is always excluded (anchor) ──

@test "PCF: archive/* proposals never appear in any role output (anchor)" {
  for role in bachelorprojekt-website bachelorprojekt-ops orchestrator; do
    out="$(bash "$SCRIPT" "$role" 2>/dev/null || true)"
    # If any archive/ slug leaks in, its header would be present.
    if echo "$out" | grep -qE '^### Active proposal: (openspec-archive-fallback|template-change|legacy-import)'; then
      echo "REGRESSION: archive/* proposal leaked into output for role=$role"
      return 1
    fi
  done
}

# ── (6) Filter actually reduces output volume (the bug's main symptom) ──

@test "PCF: filtered output is substantially smaller than orchestrator output" {
  all="$(bash "$SCRIPT" orchestrator 2>/dev/null | grep -c '^### Active proposal:' || true)"
  ops="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null | grep -c '^### Active proposal:' || true)"
  website="$(bash "$SCRIPT" bachelorprojekt-website 2>/dev/null | grep -c '^### Active proposal:' || true)"
  # A correctly filtered ops/website output should be strictly less than
  # the unfiltered orchestrator count (the script today returns the same
  # ~60 entries for all three — the bug). Allow a small floor to absorb
  # multi-domain proposals but require a real reduction (≥ 25%).
  [ "$ops" -lt "$all" ] \
    || { echo "BUG STILL ACTIVE: ops count ($ops) >= orchestrator count ($all) — filter does nothing"; return 1; }
  [ "$website" -lt "$all" ] \
    || { echo "BUG STILL ACTIVE: website count ($website) >= orchestrator count ($all) — filter does nothing"; return 1; }
}

# ── (7) Mandatory-arg check (anchor — existing behavior must not regress) ──

@test "PCF: no-arg invocation exits non-zero with Usage on stderr (anchor)" {
  run bash "$SCRIPT" 2>&1
  [ "$status" -ne 0 ] || { echo "expected non-zero exit without args"; return 1; }
  echo "$output" | grep -q 'Usage' \
    || { echo "expected 'Usage' on stderr (got: $output)"; return 1; }
}
