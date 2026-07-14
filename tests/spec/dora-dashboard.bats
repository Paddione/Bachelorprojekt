#!/usr/bin/env bats
# tests/spec/dora-dashboard.bats
# SSOT: openspec/specs/dora-dashboard.md
#
# Consolidated BATS suite for the DORA dashboard removal (T001433).
# Convention: one .bats file per OpenSpec SSOT spec.

# ── File-level variables ──────────────────────────────────────────────────────
DORA_PAGE="$BATS_TEST_DIRNAME/../../website/src/pages/admin/dora.astro"
DORA_DASHBOARD="$BATS_TEST_DIRNAME/../../website/src/components/admin/DoraDashboard.svelte"
DORA_METRICS_LIB="$BATS_TEST_DIRNAME/../../website/src/lib/dora-metrics.ts"
DORA_API="$BATS_TEST_DIRNAME/../../website/src/pages/api/admin/dora-metrics.ts"

# ── T001433: DORA removal ─────────────────────────────────────────────────────
@test "T001433 dora: /admin/dora redirect stub is removed" {
  [ ! -f "$DORA_PAGE" ]
}

@test "T001433 dora: DoraDashboard.svelte is removed" {
  [ ! -f "$DORA_DASHBOARD" ]
}

@test "T001433 dora: lib/dora-metrics.ts is removed" {
  [ ! -f "$DORA_METRICS_LIB" ]
}

@test "T001433 dora: pages/api/admin/dora-metrics.ts is removed" {
  [ ! -f "$DORA_API" ]
}
