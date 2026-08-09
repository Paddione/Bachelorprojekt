#!/usr/bin/env bats
# tests/spec/mcp-gateway/agy-mcp-permissions.bats
# SSOT: openspec/specs/mcp-gateway.md
# Ticket: T002719

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SPEC="$REPO/openspec/specs/mcp-gateway.md"
}

@test "agy binary supports --dangerously-skip-permissions flag" {
  run agy --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--dangerously-skip-permissions"* ]]
}

@test "mcp-gateway.md spec contains requirement for agy Headless MCP Tool Permission Bypass" {
  run grep -c "Requirement: agy Headless MCP Tool Permission Bypass" "$SPEC"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
