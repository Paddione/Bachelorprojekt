#!/usr/bin/env bats
# tests/spec/plan-context.bats
# SSOT: openspec/changes/plan-context-role-filter/specs/dev-flow-plan.md
# T001387 — plan-context.sh <role> wertet <role> nie aus; Filter ist wirkungslos.
# T001534 — decoupled from live openspec/changes/ contents (PR #2480 archived
#   60 stale changes incl. the two proposals this file used to hardcode by
#   name, and dropped the active-changes count below the old >=30 floor —
#   breaking these tests without any change to plan-context.sh itself).
# T001895 — fixtures moved out of the real $REPO/openspec/changes/ into a
#   throwaway git repo under $BATS_TEST_TMPDIR. plan-context.sh anchors its
#   CHANGES_DIR via `git rev-parse --show-toplevel`, so writing fixtures
#   straight into the real repo tree raced against openspec-workflow.bats's
#   "T001452: validator ignores specs under openspec/specs/archive/" test
#   (both files run in parallel in the CI "Spec BATS" job, `bats -j $(nproc)
#   --no-parallelize-within-files`). That test calls
#   `validateTree('openspec')` against the real repo mid-test; if it ran
#   while a fixture dir was present (fixtures intentionally have no specs/
#   delta dir), validateTree failed with "<slug>: missing specs/ delta dir".
#   Anchoring plan-context.sh at an isolated temp repo means it never reads
#   or writes $REPO/openspec/changes/, so the two files can no longer race.
#
# Failing-test contract: these cases MUST fail on the pre-fix
# `fix/t001387-plan-context-role-filter` branch (the current script
# returns ALL proposals regardless of <role>) and MUST pass after the
# fix lands in scripts/plan-context.sh.
#
# Test strategy: run the script against a throwaway git repo built fresh in
# setup() (see TMP_ROOT below), not the real repo — CHANGES_DIR resolution
# via `git rev-parse --show-toplevel` inside plan-context.sh then anchors at
# TMP_ROOT and never touches $REPO/openspec/changes/. The fixture set is
# self-contained: exactly 3 non-archived proposals (ops/website/ci) plus one
# proposal parked directly under a slug literally named "archive" (to
# exercise the `slug == archive` skip in plan-context.sh — the real repo's
# archive/ only ever holds nested sub-dirs, so that skip is otherwise
# untested), so the "returns all non-archived proposals" / "archive is
# always excluded" anchor assertions stay meaningful without depending on
# the real repo's ever-changing openspec/changes/ contents.
#
# Cases 3, 5, 7 are anchor cases (PASS pre- and post-fix) that lock in
# the existing semantics (archive exclusion, mandatory-arg error) so
# a regression on the existing path is also caught.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCRIPT="$REPO/scripts/plan-context.sh"
  [[ -x "$SCRIPT" ]] || chmod +x "$SCRIPT"

  # Throwaway git repo so `git rev-parse --show-toplevel` inside
  # plan-context.sh anchors CHANGES_DIR here, never at $REPO. Each bats test
  # gets its own unique $BATS_TEST_TMPDIR, so parallel test files/processes
  # never share this directory.
  TMP_ROOT="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$TMP_ROOT"
  git init -q "$TMP_ROOT"
  git -C "$TMP_ROOT" config user.email "pcf-test@example.invalid"
  git -C "$TMP_ROOT" config user.name "PCF Test"

  CHANGES_DIR="$TMP_ROOT/openspec/changes"
  FIXTURE_OPS_SLUG="zz-test-pcf-fixture-ops"
  FIXTURE_WEBSITE_SLUG="zz-test-pcf-fixture-website"
  FIXTURE_CI_SLUG="zz-test-pcf-fixture-ci"
  FIXTURE_ARCHIVE_SLUG="archive"

  _make_fixture() {
    local slug="$1" domains="$2"
    mkdir -p "$CHANGES_DIR/$slug"
    cat > "$CHANGES_DIR/$slug/proposal.md" <<EOF
---
title: "Proposal: $slug"
---

# Proposal: $slug

test fixture, safe to ignore.
EOF
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
  # A proposal parked directly at .../archive/proposal.md (unlike the real
  # repo, where archive/ only ever holds nested archive/<slug>/proposal.md
  # dirs) so the `[[ "$slug" == "archive" ]] && continue` skip in
  # plan-context.sh actually gets exercised by these tests.
  _make_fixture "$FIXTURE_ARCHIVE_SLUG" "ops"

  # Invoke plan-context.sh with CWD inside the throwaway repo so its
  # `git rev-parse --show-toplevel` resolves to TMP_ROOT.
  _run_pcf() {
    (cd "$TMP_ROOT" && bash "$SCRIPT" "$@")
  }
}

# ── (1) role=ops must include ops-tagged proposals and exclude website-only ──

@test "PCF: role=bachelorprojekt-ops includes ops-tagged proposal (fixture)" {
  out="$(_run_pcf bachelorprojekt-ops 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: $FIXTURE_OPS_SLUG" \
    || { echo "MISSING: $FIXTURE_OPS_SLUG (domains: [ops]) should be included for ops"; return 1; }
}

@test "PCF: role=bachelorprojekt-ops excludes website-only proposal (fixture)" {
  out="$(_run_pcf bachelorprojekt-ops 2>/dev/null || true)"
  if echo "$out" | grep -q "### Active proposal: $FIXTURE_WEBSITE_SLUG"; then
    echo "REGRESSION: $FIXTURE_WEBSITE_SLUG (domains: [website]) leaked into ops output — filter not active"
    return 1
  fi
}

@test "PCF: role=bachelorprojekt-ops excludes non-ops/non-infra proposal (fixture)" {
  out="$(_run_pcf bachelorprojekt-ops 2>/dev/null || true)"
  if echo "$out" | grep -q "### Active proposal: $FIXTURE_CI_SLUG"; then
    echo "REGRESSION: $FIXTURE_CI_SLUG (domains: [ci]) leaked into ops output — filter not active"
    return 1
  fi
}

# ── (2) role=website must include website-tagged and exclude pure-test ──

@test "PCF: role=bachelorprojekt-website includes website-tagged proposal (fixture)" {
  out="$(_run_pcf bachelorprojekt-website 2>/dev/null || true)"
  echo "$out" | grep -q "### Active proposal: $FIXTURE_WEBSITE_SLUG" \
    || { echo "MISSING: $FIXTURE_WEBSITE_SLUG (domains: [website]) should be included for website"; return 1; }
}

@test "PCF: role=bachelorprojekt-website excludes non-website proposal (fixture)" {
  out="$(_run_pcf bachelorprojekt-website 2>/dev/null || true)"
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

  out="$(_run_pcf orchestrator 2>/dev/null || true)"
  count=$(echo "$out" | grep -c '^### Active proposal:' || true)
  [ "$count" -eq "$expected" ] \
    || { echo "orchestrator should return all $expected non-archived proposals (got $count)"; return 1; }
}

# ── (4) role=foobar (unknown) emits stderr WARN and returns all proposals ──

@test "PCF: unknown role emits WARN: unknown role on stderr" {
  err="$(_run_pcf foobar 2>&1 >/dev/null || true)"
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

  out="$(_run_pcf foobar 2>/dev/null || true)"
  count=$(echo "$out" | grep -c '^### Active proposal:' || true)
  [ "$count" -eq "$expected" ] \
    || { echo "unknown role should return all $expected proposals as fail-soft (got $count)"; return 1; }
}

# ── (5) archive/ is always excluded (anchor) ──

@test "PCF: archive/* proposals never appear in any role output (anchor)" {
  for role in bachelorprojekt-website bachelorprojekt-ops orchestrator; do
    out="$(_run_pcf "$role" 2>/dev/null || true)"
    if echo "$out" | grep -qE "^### Active proposal: $FIXTURE_ARCHIVE_SLUG\$"; then
      echo "REGRESSION: $FIXTURE_ARCHIVE_SLUG proposal leaked into output for role=$role"
      return 1
    fi
  done
}

# ── (6) Filter actually reduces output volume (the bug's main symptom) ──

@test "PCF: filtered output is substantially smaller than orchestrator output" {
  all="$(_run_pcf orchestrator 2>/dev/null | grep -c '^### Active proposal:' || true)"
  ops="$(_run_pcf bachelorprojekt-ops 2>/dev/null | grep -c '^### Active proposal:' || true)"
  website="$(_run_pcf bachelorprojekt-website 2>/dev/null | grep -c '^### Active proposal:' || true)"
  # A correctly filtered ops/website output should be strictly less than
  # the unfiltered orchestrator count (the script today returns the same
  # entries for all three — the bug). The fixture set (ops/website/ci)
  # guarantees a real reduction.
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
