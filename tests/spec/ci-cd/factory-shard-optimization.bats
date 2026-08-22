#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# Tests for factory shard optimization (T013528):
# - ticket-mcp:test runs in test-factory-openspec
# - test-factory-shard does NOT run ticket-mcp:test

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CI_WF="$REPO_ROOT/.github/workflows/ci.yml"
}

@test "T013528: test-factory-openspec executes ticket-mcp:test" {
  # Job test-factory-openspec must contain task ticket-mcp:test
  python3 -c "
import yaml, sys
with open('$CI_WF') as f:
    doc = yaml.safe_load(f)
steps = doc.get('jobs', {}).get('test-factory-openspec', {}).get('steps', [])
runs = [s.get('run', '') for s in steps]
found = any('ticket-mcp:test' in r for r in runs)
assert found, 'ticket-mcp:test not found in test-factory-openspec'
"
}

@test "T013528: test-factory-shard does not execute ticket-mcp:test" {
  # Job test-factory-shard must NOT run task ticket-mcp:test redundantly
  python3 -c "
import yaml, sys
with open('$CI_WF') as f:
    doc = yaml.safe_load(f)
steps = doc.get('jobs', {}).get('test-factory-shard', {}).get('steps', [])
runs = [s.get('run', '') for s in steps]
found = any('ticket-mcp:test' in r for r in runs)
assert not found, 'ticket-mcp:test still present in test-factory-shard'
"
}
