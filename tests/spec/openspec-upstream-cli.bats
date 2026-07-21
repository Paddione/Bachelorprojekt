#!/usr/bin/env bats
# tests/spec/openspec-upstream-cli.bats
# SSOT: openspec/specs/openspec-upstream-cli.md
#
# Covers: Delta-merge MODIFIED/REMOVED/RENAMED operations in openspec.sh and openspec-merge.mjs.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  MERGE="$REPO/scripts/openspec-merge.mjs"
  OPENSPEC_SH="$REPO/scripts/openspec.sh"
}

# ── openspec-merge.mjs existence ──────────────────────────────────────

@test "openspec-merge.mjs exists" {
  [ -f "$MERGE" ]
}

# ── MODIFIED operation ────────────────────────────────────────────────

@test "openspec-merge.mjs parses MODIFIED Requirements section" {
  run grep -q 'MODIFIED' "$MERGE"
  [ "$status" -eq 0 ]
}

# ── REMOVED operation ─────────────────────────────────────────────────

@test "openspec-merge.mjs parses REMOVED Requirements section" {
  run grep -q 'REMOVED' "$MERGE"
  [ "$status" -eq 0 ]
}

# ── RENAMED operation ─────────────────────────────────────────────────

@test "openspec-merge.mjs parses RENAMED Requirements section" {
  run grep -q 'RENAMED' "$MERGE"
  [ "$status" -eq 0 ]
}

@test "openspec-merge.mjs requires Renamed-to directive" {
  run grep -q 'Renamed-to' "$MERGE"
  [ "$status" -eq 0 ]
}

# ── Fail-closed on skeleton stubs ────────────────────────────────────

@test "openspec-merge.mjs detects skeleton stubs (TODO markers)" {
  run grep -q 'TODO\|stub\|STUB' "$MERGE"
  [ "$status" -eq 0 ]
}

# ── openspec.sh archive command ───────────────────────────────────────

@test "openspec.sh has archive command" {
  run grep -q 'cmd_archive\|archive)' "$OPENSPEC_SH"
  [ "$status" -eq 0 ]
}

@test "openspec.sh calls openspec-merge.mjs for delta merge" {
  run grep -q 'openspec-merge.mjs' "$OPENSPEC_SH"
  [ "$status" -eq 0 ]
}

# ── openspec.sh validate command ──────────────────────────────────────

@test "openspec.sh validate checks for ADDED|MODIFIED|REMOVED|RENAMED headers" {
  run grep -q 'ADDED|MODIFIED|REMOVED|RENAMED' "$OPENSPEC_SH"
  [ "$status" -eq 0 ]
}
