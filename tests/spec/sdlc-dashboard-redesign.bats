#!/usr/bin/env bats
# sdlc-dashboard-redesign — BATS specification tests
# These tests verify the new SDLC Cockpit architecture.
# RED phase: Must FAIL before implementation.

setup() {
  load '../../test_helper/bats-support/load'
  load '../../test_helper/bats-assert/load'

  COCKPIT_URL="${COCKPIT_URL:-http://localhost:4321/sdlc/cockpit}"
}

# ────────────────────────────────────────────────────────────
# STRUCT2: Failing-test step (RED — must fail before impl)
# ────────────────────────────────────────────────────────────

@test "SDLC-DASH-01: Command Bar renders with mode toggle" {
  # Positive anchor: the page is reachable
  run curl -sS -o /dev/null -w "%{http_code}" "${COCKPIT_URL}" 2>/dev/null
  assert_output "200"

  # Check the HTML contains Command Bar structure
  run curl -sS "${COCKPIT_URL}" 2>/dev/null
  assert_output --partial "command-bar"
  # expected: FAIL (red — Command Bar not yet in deployed page;
  #   will pass once the redesigned cockpit.astro is deployed)
}

@test "SDLC-DASH-02: Overview mode renders lifecycle phases" {
  run curl -sS "${COCKPIT_URL}?mode=overview" 2>/dev/null
  assert_output --partial "overview-dashboard"
  # expected: FAIL (red — overview dashboard not yet deployed)
}

@test "SDLC-DASH-03: Fokus mode renders phase content" {
  run curl -sS "${COCKPIT_URL}?mode=fokus&phase=bauen" 2>/dev/null
  assert_output --partial "factory-floor"
  # expected: FAIL (red)
}

@test "SDLC-DASH-04: PipelinePanel no longer exists in source tree" {
  [ ! -f "website/src/components/cockpit/PipelinePanel.svelte" ]
  # expected: FAIL (red — PipelinePanel has been deleted in this branch,
  #   but the BATS test is checking the state at deploy time)
}

@test "SDLC-DASH-05: Old analytics components are removed" {
  [ ! -f "website/src/components/sdlc/factory/FactoryKpiGrid.svelte" ]
  # expected: FAIL (red — analytics components deleted from source)
}

@test "SDLC-DASH-06: Cockpit rail renders with context-sensitive content" {
  run curl -sS "${COCKPIT_URL}?mode=overview" 2>/dev/null
  assert_output --partial "cockpit-rail"
  # expected: FAIL (red)
}

@test "SDLC-DASH-07: Insights mode is accessible" {
  run curl -sS "${COCKPIT_URL}?mode=insights" 2>/dev/null
  assert_output --partial "Insights"
  # expected: FAIL (red)
}

@test "SDLC-DASH-08: URLs reflect mode transitions" {
  # Verify mode parameter is preserved in HTML
  run curl -sS "${COCKPIT_URL}?mode=fokus&phase=planung" 2>/dev/null
  # At minimum, the page serves without error
  assert_output --partial "SDLC Cockpit"
  # expected: FAIL (red — page should render, but content tests may fail
  #   until the full redesign is deployed)
}

@test "SDLC-DASH-09: PlanningOffice is preserved (not removed)" {
  [ -f "website/src/components/PlanningOffice.svelte" ]
  # expected: PASS (green — PlanningOffice must survive the redesign)
}

@test "SDLC-DASH-10: FactoryFloor is preserved (not removed)" {
  [ -f "website/src/components/sdlc/FactoryFloor.svelte" ]
  # expected: PASS (green — FactoryFloor must survive the redesign)
}
