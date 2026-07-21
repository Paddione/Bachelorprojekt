#!/usr/bin/env bats
# tests/spec/astro-type-check.bats
# SSOT: openspec/specs/astro-type-check.md
#
# Covers: astro:check script, CI job, fixture factory existence.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── REQ-ASTRO-TC-003: Check Script ───────────────────────────────────

@test "REQ-ASTRO-TC-003: website/package.json has astro:check script" {
  run grep -q '"astro:check"' "$REPO/website/package.json"
  [ "$status" -eq 0 ]
}

# ── REQ-ASTRO-TC-004: CI Advisory Gate ───────────────────────────────

@test "REQ-ASTRO-TC-004: ci.yml has Astro TypeScript check job" {
  run grep -q 'Astro TypeScript check\|astro.*check' "$REPO/.github/workflows/ci.yml"
  [ "$status" -eq 0 ]
}

@test "REQ-ASTRO-TC-004: CI job runs pnpm run astro:check" {
  run grep -q 'pnpm run astro:check\|pnpm astro:check' "$REPO/.github/workflows/ci.yml"
  [ "$status" -eq 0 ]
}

# ── REQ-ASTRO-TC-002: Fixture Factory ────────────────────────────────

@test "REQ-ASTRO-TC-002: fixture factory exists at website/src/lib/tickets/__tests__/fixtures.ts" {
  [ -f "$REPO/website/src/lib/tickets/__tests__/fixtures.ts" ]
}

@test "REQ-ASTRO-TC-002: fixture factory exports makeRollup" {
  run grep -q 'makeRollup' "$REPO/website/src/lib/tickets/__tests__/fixtures.ts"
  [ "$status" -eq 0 ]
}
