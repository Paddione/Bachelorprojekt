#!/usr/bin/env bats
# tests/spec/mcp-gateway/agy-mcp-permissions.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002719

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SPEC="$REPO/openspec/specs/mcp-gateway.md"
}

@test "agy binary supports --dangerously-skip-permissions flag" {
  # Umgebungsabhaengig: agy ist ein lokal installiertes Drittanbieter-Binary und
  # steht auf GitHub-Runnern nicht zur Verfuegung — CI installiert es nirgends.
  # Ohne diesen Guard waere der Test dort dauerhaft rot, ohne etwas ueber das
  # Repo auszusagen. Gleiches Muster wie tests/spec/sealed-secret-cluster-drift.bats
  # (kein erreichbarer Cluster -> skip).
  command -v agy >/dev/null 2>&1 || skip "agy binary not installed"
  run agy --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--dangerously-skip-permissions"* ]]
}

@test "mcp-gateway.md spec contains requirement for agy Headless MCP Tool Permission Bypass" {
  run grep -c "Requirement: agy Headless MCP Tool Permission Bypass" "$SPEC"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
