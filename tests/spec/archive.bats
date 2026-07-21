#!/usr/bin/env bats
# tests/spec/archive.bats
# SSOT: openspec archive workflow (openspec.sh archive + openspec-merge.mjs)
#
# Covers: OpenSpec archive pipeline, status-map refresh, delta merge integration.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Archive command existence ─────────────────────────────────────────

@test "openspec.sh has archive verb" {
  run grep -q 'archive' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

@test "openspec.sh archive moves changes to archive directory" {
  run grep -q 'archive\|mv.*archive\|dest.*archive' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

# ── Status map refresh ────────────────────────────────────────────────

@test "openspec-status-map.sh exists for status refresh" {
  [ -f "$REPO/scripts/openspec-status-map.sh" ]
}

@test "openspec.sh archive calls status-map refresh" {
  run grep -q 'openspec-status-map' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

# ── Delta merge integration ───────────────────────────────────────────

@test "openspec.sh archive calls openspec-merge.mjs for delta merge" {
  run grep -q 'openspec-merge.mjs\|_merge_delta' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

@test "openspec-merge.mjs is invoked with apply subcommand" {
  run grep -q "apply.*delta\|apply.*\$delta\|apply.*\$ssot" "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

# ── Embed refresh after archive ───────────────────────────────────────

@test "openspec.sh archive triggers pgvector embed refresh" {
  run grep -q '_embed_slug\|openspec-embed' "$REPO/scripts/openspec.sh"
  [ "$status" -eq 0 ]
}

# ── OpenSpec CLI archive integration ──────────────────────────────────

@test "openspec-propose skill exists" {
  [ -f "$REPO/.claude/skills/openspec-propose/SKILL.md" ]
}

@test "openspec-apply-change skill exists" {
  [ -f "$REPO/.claude/skills/openspec-apply-change/SKILL.md" ]
}

@test "openspec-archive-change skill exists" {
  [ -f "$REPO/.claude/skills/openspec-archive-change/SKILL.md" ]
}
