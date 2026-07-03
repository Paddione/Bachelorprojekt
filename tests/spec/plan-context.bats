#!/usr/bin/env bats
# tests/spec/plan-context.bats
# SSOT: openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md
# T001387 — plan-context.sh <role> wertet <role> nie aus; Filter ist wirkungslos.
# T001534 — decoupled from live openspec/changes/ contents (PR #2480 archived
#   60 stale changes incl. the two proposals this file used to hardcode by
#   name, and dropped the active-changes count below the old >=30 floor —
#   breaking these tests without any change to plan-context.sh itself).
#
# Failing-test contract: these cases MUST fail on the pre-fix
# `fix/t001387-plan-context-role-filter` branch (the current script
# returns ALL proposals regardless of <role>) and MUST pass after the
# fix lands in scripts/plan-context.sh.
#
# Test strategy: we run the script against the *real* repo (the script
# uses `git rev-parse --show-toplevel` to anchor `CHANGES_DIR`; an
# OPENSPEC_ROOT override is intentionally NOT used so we test the
# production code path). To stay independent of the ever-changing set of
# real active OpenSpec changes (proposals get archived over time), the
# role-filter inclusion/exclusion cases use dedicated fixture proposals
# created in setup() and removed in teardown(). Anchor cases that assert
# "all non-archived proposals" compare against the real on-disk count
# computed at test time, not a hardcoded floor.
#
# Cases 3, 5, 7 are anchor cases (PASS pre- and post-fix) that lock in
# the existing semantics (archive exclusion, mandatory-arg error) so
# a regression on the existing path is also caught.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO/scripts/plan-context.sh"
  [[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT"

  CHANGES_DIR="$REPO/openspec/changes"
  FIXTURE_OPS_SLUG="zz-test-pcf-fixture-ops"
  FIXTURE_WEBSITE_SLUG="zz-test-pcf-fixture-website"
  FIXTURE_CI_SLUG="zz-test-pcf-fixture-ci"

  _make_fixture() {
    local slug="$1" domains="$2"
    mkdir -p "$CHANGES_DIR/$slug"
    cat > "$CHANGES_DIR/$slug/proposal.md" <<EOF
---
title: "Proposal: $slug"
EOF
    printf -- '---\n' >> "$CHANGES_DIR/$slug/proposal.md"
    printf '\n# Proposal: %s\n\ntest fixture, safe to ignore.\n' "$slug" >> "$CHANGES_DIR/$slug/proposal.md"
    cat > "$CHANGES_DIR/$slug/tasks.md" <<EOF
---
title: "Tasks: $slug"
domains: [$domains]
status: active
---

# Tasks: $slug

- [ ] test fixture task
EOF
  }

  _make_fixture "$FIXTURE_OPS_SLUG" "ops"
  _make_fixture "$FIXTURE_WEBSITE_SLUG" "website"
  _make_fixture "$FIXTURE_CI_SLUG" "ci"
}

teardown() {
  rm -rf "$CHANGES_DIR/$FIXTURE_OPS_SLUG" "$CHANGES_DIR/$FIXTURE_WEBSITE_SLUG" "$CHANGES_DIR/$FIXTURE_CI_SLUG"
}

# ── (1) role=ops must include ops-tagged proposals and exclude website-only ──

@test "PCF: role=bachelorprojekt-ops includes ops-tagged proposal (fixture)" {
  out="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: $FIXTURE_OPS_SLUG" \
    || { echo "MISSING: $FIXTURE_OPS_SLUG (domains: [ops]) should be included for ops"; return 1; }
}

@test "PCF: role=bachelorprojekt-ops excludes website-only proposal (fixture)" {
  out="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null || true)"
  if echo "$out" | grep -q "### Active proposal: $FIXTURE_WEBSITE_SLUG"; then
    echo "REGRESSION: $FIXTURE_WEBSITE_SLUG (domains: [website]) leaked into ops output — filter not active"
    return 1
  fi
}

@test "PCF: role=bachelorprojekt-ops excludes non-ops/non-infra proposal (fixture)" {
  out="$(bash "$SCRIPT" bachelorprojekt-ops 2>/dev/null || true)"
  if echo "$out" | grep -q "### Active proposal: $FIXTURE_CI_SLUG"; then
    echo "REGRESSION: $FIXTURE_CI_SLUG (domains: [ci]) leaked into ops output — filter not active"
    return 1
  fi
}

# ── (2) role=website must include website-tagged and exclude pure-test ──

@test "PCF: role=bachelorprojekt-website includes website-tagged proposal (fixture)" {
  out="$(bash "$SCRIPT" bachelorprojekt-website 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: $FIXTURE_WEBSITE_SLUG" \
    || { echo "MISSING: $FIXTURE_WEBSITE_SLUG (domains: [website]) should be included for website"; return 1; }
}

@test "PCF: role=bachelorprojekt-website excludes non-website proposal (fixture)" {
  out="$(bash "$SCRIPT" bachelorprojekt-website 2>/dev/null || true)"
  if echo "$out" | grep -q "### Active proposal: $FIXTURE_OPS_SLUG"; then
    echo "REGRESSION: $FIXTURE_OPS_SLUG (domains: [ops]) leaked into website output"
    return 1
  fi
}

# ── (3) role=orchestrator returns all non-archived proposals (anchor) ──

@test "PCF: role=orchestrator returns all non-archived proposals (anchor)" {
  expected=0
  for f in "$CHANGES_DIR"/*/proposal.md; do
    [[ -f "$f" ]] || continue
    slug=$(basename "$(dirname "$f")")
    [[ "$slug" == "archive" ]] && continue
    expected=$((expected+1))
  done

  out="$(bash "$SCRIPT" orchestrator 2>/dev/null || true)"
  count=$(echo "$out" | grep -c '^### Active proposal:' || true)
  [ "$count" -eq "$expected" ] \
    || { echo "orchestrator should return all $expected non-archived proposals (got $count)"; return 1; }
}

# ── (4) role=foobar (unknown) emits stderr WARN and returns all proposals ──

@test "PCF: unknown role emits WARN: unknown role on stderr" {
  err="$(bash "$SCRIPT" foobar 2>&1 >/dev/null || true)"
  echo "$err" | grep -Eq 'WARN: *unknown role' \
    || { echo "MISSING stderr WARN for unknown role (got: $err)"; return 1; }
}

@test "PCF: unknown role returns all non-archived proposals (fail-soft)" {
  expected=0
  for f in "$CHANGES_DIR"/*/proposal.md; do
    [[ -f "$f" ]] || continue
    slug=$(basename "$(dirname "$f")")
    [[ "$slug" == "archive" ]] && continue
    expected=$((expected+1))
  done

  out="$(bash "$SCRIPT" foobar 2>/dev/null || true)"
  count=$(echo "$out" | grep -c '^### Active proposal:' || true)
  [ "$count" -eq "$expected" ] \
    || { echo "unknown role should return all $expected proposals as fail-soft (got $count)"; return 1; }
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
  # entries for all three — the bug). The three fixture proposals plus at
  # least one non-matching real proposal (fixture-ci is domains:[ci],
  # excluded from both) guarantee a real reduction.
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
